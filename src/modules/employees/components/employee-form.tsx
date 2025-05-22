
"use client";

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { employeeSchema, type EmployeeFormData, employmentTypeSchema, genderSchema } from '@/modules/employees/types';
import type { Employee, Gender } from '@/modules/employees/types';
import type { UserRole } from '@/modules/auth/types';
import { addEmployee, updateEmployee } from '@/modules/employees/actions';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CalendarIcon, Save, UserPlus, Search, XCircle } from 'lucide-react'; // Added XCircle
import { format, parseISO, isValid } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { ScrollArea } from '@/components/ui/scroll-area';


interface EmployeeFormProps {
  employee?: Employee;
  submitButtonText?: string;
  formTitle: string;
  formDescription: string;
  tenantDomain: string;
  currentUserRole: UserRole | null;
}

type EmployeeFormShape = EmployeeFormData;

export function EmployeeForm({
  employee,
  submitButtonText,
  formTitle,
  formDescription,
  tenantDomain,
  currentUserRole,
}: EmployeeFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = React.useState(false);
  const [hireDatePickerOpen, setHireDatePickerOpen] = React.useState(false);
  const [dobDatePickerOpen, setDobDatePickerOpen] = React.useState(false);

  const [potentialManagers, setPotentialManagers] = React.useState<Employee[]>([]);
  const [isLoadingManagers, setIsLoadingManagers] = React.useState(false);
  const [managerLookupSearchTerm, setManagerLookupSearchTerm] = React.useState("");
  const [isManagerLookupOpen, setIsManagerLookupOpen] = React.useState(false);
  const [selectedManagerName, setSelectedManagerName] = React.useState<string>("");


  const isEditMode = !!employee;
  const actualSubmitButtonText = submitButtonText || (isEditMode ? "Save Changes" : "Add Employee");
  const isEmployeeRole = currentUserRole === 'Employee';

  const getFormattedDate = (dateString?: string | null): string => {
    if (!dateString) return "";
    try {
      const parsedDate = parseISO(dateString);
      return isValid(parsedDate) ? format(parsedDate, 'yyyy-MM-dd') : "";
    } catch (e) {
      console.error("Error parsing date:", e);
      return "";
    }
  };

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const formSchemaForValidation = employeeSchema.omit({ tenantId: true, userId: true, employeeId: true })
    .extend({
        reportingManagerId: z.string().uuid("Invalid manager ID format.").nullable().optional(),
    });


  const form = useForm<EmployeeFormShape>({
    resolver: zodResolver(formSchemaForValidation),
    defaultValues: {
      name: employee?.name ?? "",
      email: employee?.email ?? "",
      phone: employee?.phone ?? "",
      gender: employee?.gender ?? undefined,
      position: employee?.position ?? "",
      department: employee?.department ?? "",
      hireDate: getFormattedDate(employee?.hireDate),
      status: employee?.status ?? "Active",
      dateOfBirth: getFormattedDate(employee?.dateOfBirth),
      reportingManagerId: employee?.reportingManagerId || null,
      workLocation: employee?.workLocation ?? "",
      employmentType: employee?.employmentType ?? "Full-time",
    },
  });

  React.useEffect(() => {
    if (currentUserRole === 'Admin' || currentUserRole === 'Manager') {
        const fetchManagers = async () => {
          setIsLoadingManagers(true);
          console.log("[EmployeeForm - fetchManagers] Fetching potential managers...");
          try {
            const response = await fetch('/api/employees'); // API derives tenant context
            if (!response.ok) {
              const errorData = await response.json().catch(() => ({}));
              console.error("[EmployeeForm - fetchManagers] API error:", errorData);
              throw new Error(errorData.message || 'Failed to fetch potential managers');
            }
            const data: Employee[] = await response.json();
            console.log(`[EmployeeForm - fetchManagers] Employees fetched from API: ${data.length}`);
            const filteredData = data.filter(e => e.status === 'Active' && (isEditMode ? e.id !== employee?.id : true));
            setPotentialManagers(filteredData);
            console.log(`[EmployeeForm - fetchManagers] Potential managers after filtering: ${filteredData.length}`);

            // If editing and employee has a reportingManagerId, find and set their name
            if (isEditMode && employee?.reportingManagerId) {
                const currentManager = filteredData.find(m => m.id === employee.reportingManagerId);
                if (currentManager) {
                    setSelectedManagerName(currentManager.name);
                } else if (potentialManagers.length > 0) { // Fallback if manager not in filtered list (e.g. inactive)
                    const originalManager = potentialManagers.find(m => m.id === employee.reportingManagerId) || data.find(m => m.id === employee.reportingManagerId);
                    if(originalManager) setSelectedManagerName(`${originalManager.name} (Current)`);
                }
            } else if (!isEditMode) {
                 setSelectedManagerName(""); // Clear for new employee form
            }

          } catch (error) {
            console.error("[EmployeeForm - fetchManagers] Failed to load managers:", error);
            toast({
              title: "Error Loading Managers",
              description: (error as Error).message || "Could not fetch list of potential managers.",
              variant: "destructive",
            });
          } finally {
            setIsLoadingManagers(false);
          }
        };
        fetchManagers();
    }
  }, [isEditMode, employee?.id, employee?.reportingManagerId, toast, currentUserRole]); // Removed potentialManagers from deps

  const potentialManagersFiltered = React.useMemo(() => {
    if (!managerLookupSearchTerm) return potentialManagers;
    return potentialManagers.filter(
      (manager) =>
        manager.name.toLowerCase().includes(managerLookupSearchTerm.toLowerCase()) ||
        (manager.employeeId && manager.employeeId.toLowerCase().includes(managerLookupSearchTerm.toLowerCase())) ||
        (manager.email && manager.email.toLowerCase().includes(managerLookupSearchTerm.toLowerCase()))
    );
  }, [potentialManagers, managerLookupSearchTerm]);

  const onSubmit = async (data: EmployeeFormShape) => {
    setIsLoading(true);
    console.log("[Employee Form] Submitting data (raw from form):", data);

    const payload = {
      ...data,
      phone: data.phone || undefined,
      gender: data.gender || undefined,
      dateOfBirth: data.dateOfBirth || null,
      reportingManagerId: data.reportingManagerId, // Should be UUID string or null
      workLocation: data.workLocation || undefined,
    };
    console.log("[Employee Form] Payload to be sent to action:", payload);


    try {
        let result;
        if (isEditMode && employee?.id) {
            result = await updateEmployee(employee.id, payload);
        } else {
            result = await addEmployee(payload);
        }

        if (!result.success) {
             console.error("[Employee Form] Action Error:", result.errors);
             let errorMessage = result.errors?.[0]?.message || `Failed to ${isEditMode ? 'update' : 'add'} employee.`;
             let errorSetOnField = false;
             result.errors?.forEach(err => {
                const path = err.path?.[0] as keyof EmployeeFormShape | 'root.serverError' | undefined;
                if (path && path !== 'root.serverError' && form.getFieldState(path as keyof EmployeeFormShape)) {
                    form.setError(path as keyof EmployeeFormShape, { type: "manual", message: err.message });
                    errorSetOnField = true;
                }
             });
             if (!errorSetOnField && !result.errors?.some(e => e.path.length > 0)) {
                form.setError("root.serverError", { message: errorMessage });
             }
             throw new Error(errorMessage);
        }

        console.log("[Employee Form] Action Success:", result);

        toast({
            title: `Employee ${isEditMode ? 'Updated' : 'Added'}`,
            description: `${result.employee?.name || data.name} has been successfully ${isEditMode ? 'updated' : 'added'}. ${!isEditMode && result.employee?.employeeId ? `Employee ID: ${result.employee.employeeId}` : ''}`,
            className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
        });

        const targetPath = `/${tenantDomain}/employees`;
        router.push(isEditMode && employee?.id ? `/${tenantDomain}/employees/${employee.id}` : targetPath);
        router.refresh();

    } catch (error: any) {
        console.error("[Employee Form] Submission error:", error);
        if (!form.formState.errors.root?.serverError && !Object.keys(form.formState.errors).some(key => key !== 'root' && form.getFieldState(key as keyof EmployeeFormShape)?.error)) {
            toast({
                title: `Error ${isEditMode ? 'Updating' : 'Adding'} Employee`,
                description: error.message || "An unexpected error occurred.",
                variant: "destructive",
            });
            form.setError("root.serverError", { message: error.message || "An unexpected error occurred." });
        }
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
         {form.formState.errors.root?.serverError && (
          <FormMessage className="text-destructive text-center bg-destructive/10 p-3 rounded-md">
            {form.formState.errors.root.serverError.message}
          </FormMessage>
        )}
        <div className="space-y-4">
          {isEditMode && employee?.employeeId && (
            <FormItem>
              <FormLabel>Employee ID</FormLabel>
              <FormControl>
                <Input value={employee.employeeId} readOnly disabled className="bg-muted" />
              </FormControl>
            </FormItem>
          )}
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Full Name *</FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Jane Doe" {...field} disabled={isEmployeeRole && isEditMode} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
             <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email Address *</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="e.g. jane.doe@company.com" {...field} disabled={isEmployeeRole && isEditMode} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
             <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone Number</FormLabel>
                  <FormControl>
                    <Input type="tel" placeholder="e.g. 123-456-7890" {...field} value={field.value ?? ""} disabled={isEmployeeRole && isEditMode && !['phone', 'dateOfBirth', 'gender'].includes(field.name)} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
             <FormField
              control={form.control}
              name="gender"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Gender</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value ?? undefined}
                    disabled={isEmployeeRole && isEditMode && !['phone', 'dateOfBirth', 'gender'].includes(field.name)}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select gender" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {genderSchema.options.map(option => (
                        <SelectItem key={option} value={option}>{option}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="dateOfBirth"
              render={({ field }) => (
                <FormItem className="flex flex-col pt-2">
                  <FormLabel>Date of Birth</FormLabel>
                  <Popover open={dobDatePickerOpen} onOpenChange={setDobDatePickerOpen}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant={"outline"}
                          className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                          disabled={isEmployeeRole && isEditMode && !['phone', 'dateOfBirth', 'gender'].includes(field.name)}
                        >
                          {field.value && isValid(parseISO(field.value)) ? format(parseISO(field.value), "PPP") : <span>Pick a date</span>}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value && isValid(parseISO(field.value)) ? parseISO(field.value) : undefined}
                        onSelect={(date) => {
                           field.onChange(date ? format(date, 'yyyy-MM-dd') : "");
                           setDobDatePickerOpen(false);
                        }}
                        captionLayout="dropdown-buttons" fromYear={1950} toYear={new Date().getFullYear() - 18}
                        initialFocus
                        disabled={isEmployeeRole && isEditMode && !['phone', 'dateOfBirth', 'gender'].includes(field.name)}
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
             <FormField
              control={form.control}
              name="position"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Position / Job Title *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Software Engineer" {...field} disabled={isEmployeeRole} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
             <FormField
              control={form.control}
              name="department"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Department *</FormLabel>
                   <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isEmployeeRole}>
                     <FormControl>
                       <SelectTrigger>
                         <SelectValue placeholder="Select department" />
                       </SelectTrigger>
                     </FormControl>
                     <SelectContent>
                       <SelectItem value="Technology">Technology</SelectItem>
                       <SelectItem value="Human Resources">Human Resources</SelectItem>
                       <SelectItem value="Marketing">Marketing</SelectItem>
                       <SelectItem value="Sales">Sales</SelectItem>
                       <SelectItem value="Finance">Finance</SelectItem>
                       <SelectItem value="Operations">Operations</SelectItem>
                       <SelectItem value="Construction">Construction</SelectItem>
                       <SelectItem value="Other">Other</SelectItem>
                     </SelectContent>
                   </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

        <FormField
            control={form.control}
            name="reportingManagerId"
            render={({ field }) => (
                <FormItem>
                    <FormLabel>Reporting Manager</FormLabel>
                    <div className="flex items-center gap-2">
                        <Input
                            readOnly
                            value={selectedManagerName || (isLoadingManagers ? "Loading..." : "None selected")}
                            placeholder="Select a manager"
                            className="flex-grow bg-muted cursor-default"
                        />
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setIsManagerLookupOpen(true)}
                            disabled={isLoadingManagers || isEmployeeRole}
                            className="shrink-0"
                        >
                            <Search className="mr-2 h-4 w-4" />
                            {selectedManagerName ? "Change" : "Select"}
                        </Button>
                        {selectedManagerName && (
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                    field.onChange(null);
                                    setSelectedManagerName("");
                                }}
                                disabled={isEmployeeRole}
                                className="shrink-0 text-muted-foreground hover:text-destructive"
                                title="Clear manager selection"
                            >
                                <XCircle className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                    <FormMessage />
                </FormItem>
            )}
        />

        <Dialog open={isManagerLookupOpen} onOpenChange={setIsManagerLookupOpen}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Select Reporting Manager</DialogTitle>
                    <DialogDescription>Search and select an active employee to be the reporting manager.</DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-4">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            type="text"
                            placeholder="Search managers by name, ID, email..."
                            value={managerLookupSearchTerm}
                            onChange={(e) => setManagerLookupSearchTerm(e.target.value)}
                            className="pl-8"
                        />
                    </div>
                    <ScrollArea className="h-[300px] border rounded-md">
                        {potentialManagersFiltered.length > 0 ? (
                            potentialManagersFiltered.map((manager) => (
                                <Button
                                    key={manager.id}
                                    variant="ghost"
                                    className="w-full justify-start h-auto py-2 px-3 text-left"
                                    onClick={() => {
                                        form.setValue('reportingManagerId', manager.id, { shouldValidate: true, shouldDirty: true });
                                        setSelectedManagerName(manager.name);
                                        setIsManagerLookupOpen(false);
                                    }}
                                >
                                    <div className="flex flex-col">
                                      <span>{manager.name}</span>
                                      <span className="text-xs text-muted-foreground">{manager.position} ({manager.employeeId || manager.email})</span>
                                    </div>
                                </Button>
                            ))
                        ) : (
                            <p className="p-4 text-center text-sm text-muted-foreground">
                                {isLoadingManagers ? "Loading managers..." : "No active managers found" + (managerLookupSearchTerm ? " matching your search." : ".")}
                            </p>
                        )}
                    </ScrollArea>
                </div>
                 <DialogClose asChild>
                    <Button type="button" variant="outline" className="mt-2">Cancel</Button>
                </DialogClose>
            </DialogContent>
        </Dialog>


           <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="employmentType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Employment Type *</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isEmployeeRole}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select employment type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {employmentTypeSchema.options.map(type => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
             <FormField
               control={form.control}
               name="hireDate"
               render={({ field }) => (
                 <FormItem className="flex flex-col">
                   <FormLabel>Hire Date *</FormLabel>
                   <Popover open={hireDatePickerOpen} onOpenChange={setHireDatePickerOpen}>
                     <PopoverTrigger asChild>
                       <FormControl>
                         <Button
                           variant={"outline"}
                           className={cn("w-full pl-3 text-left font-normal",!field.value && "text-muted-foreground")}
                           disabled={isEmployeeRole}
                         >
                           {field.value && isValid(parseISO(field.value)) ? format(parseISO(field.value), "PPP") : <span>Pick a date</span>}
                           <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                         </Button>
                       </FormControl>
                     </PopoverTrigger>
                     <PopoverContent className="w-auto p-0" align="start">
                       <Calendar
                         mode="single"
                         selected={field.value && isValid(parseISO(field.value)) ? parseISO(field.value) : undefined}
                         onSelect={(date) => {
                            field.onChange(date ? format(date, 'yyyy-MM-dd') : "");
                            setHireDatePickerOpen(false);
                         }}
                         disabled={(date) => (date > new Date() || date < new Date("1900-01-01")) || isEmployeeRole}
                         initialFocus
                       />
                     </PopoverContent>
                   </Popover>
                   <FormMessage />
                 </FormItem>
               )}
             />
           </div>

           <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
             <FormField
              control={form.control}
              name="workLocation"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Work Location</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Main Office, Remote" {...field} value={field.value ?? ""} disabled={isEmployeeRole} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status *</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isEmployeeRole}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="Inactive">Inactive</SelectItem>
                      <SelectItem value="On Leave">On Leave</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
           </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading || (!form.formState.isDirty && isEditMode && !isEmployeeRole) || (isEmployeeRole && !form.formState.isDirty && !['phone', 'dateOfBirth', 'gender'].some(key => form.getFieldState(key as keyof EmployeeFormShape).isDirty))}>
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (isEditMode ? <Save className="mr-2 h-4 w-4" /> : <UserPlus className="mr-2 h-4 w-4" />)
            }
            {isLoading ? 'Saving...' : actualSubmitButtonText}
          </Button>
        </div>
      </form>
    </Form>
  );
}
