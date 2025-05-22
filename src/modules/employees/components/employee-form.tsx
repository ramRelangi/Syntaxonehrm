
"use client";

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { employeeSchema, type EmployeeFormData, employmentTypeSchema, genderSchema } from '@/modules/employees/types';
import type { Employee, Gender } from '@/modules/employees/types';
import type { UserRole } from '@/modules/auth/types';
// import { addEmployee, updateEmployee } from '@/modules/employees/actions'; // Actions are called via API
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CalendarIcon, Save, UserPlus, Search, XCircle } from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { ScrollArea } from '@/components/ui/scroll-area';
import { z } from 'zod';

interface EmployeeFormProps {
  employee?: Employee;
  submitButtonText?: string;
  formTitle: string;
  formDescription: string;
  tenantDomain: string;
  currentUserRole: UserRole | null;
}

type EmployeeFormShape = Omit<EmployeeFormData, 'tenantId' | 'userId' | 'employeeId'>;

const NO_MANAGER_VALUE = "__NO_MANAGER__";

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
  const [managerSearchTerm, setManagerSearchTerm] = React.useState("");
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
      console.error("[EmployeeForm] Error parsing date:", e);
      return "";
    }
  };
  
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
      reportingManagerId: employee?.reportingManagerId || null, // Ensure it's null if not set
      workLocation: employee?.workLocation ?? "",
      employmentType: employee?.employmentType ?? "Full-time",
    },
  });

  // Effect to fetch potential managers
  React.useEffect(() => {
    // Only run if the user is Admin or Manager
    if (currentUserRole === 'Admin' || currentUserRole === 'Manager') {
      const fetchManagers = async () => {
        setIsLoadingManagers(true);
        console.log(`[EmployeeForm - fetchManagers effect] Role: ${currentUserRole}. Fetching managers. isEditMode: ${isEditMode}`);
        try {
          const response = await fetch('/api/employees'); // API call fetches for the current tenant
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Failed to fetch employees for manager list.' }));
            console.error("[EmployeeForm - fetchManagers] API error:", errorData);
            throw new Error(errorData.message || 'Failed to fetch potential managers');
          }
          const data: Employee[] = await response.json();
          console.log(`[EmployeeForm - fetchManagers] Raw data from API: ${data.length} employees`);
          
          const filteredData = data.filter(e => 
            e.status === 'Active' && 
            (isEditMode ? e.id !== employee?.id : true) // Exclude self if editing
          );
          setPotentialManagers(filteredData);
          console.log(`[EmployeeForm - fetchManagers] Filtered potential managers: ${filteredData.length}`);

          // Set initial selected manager name for EDIT mode
          if (isEditMode && employee?.reportingManagerId) {
            // Search in the original data list to get the name, even if the manager is now inactive
            const currentManager = data.find(m => m.id === employee.reportingManagerId); 
            if (currentManager) {
              setSelectedManagerName(currentManager.name + (currentManager.status !== 'Active' ? ' (Inactive)' : ''));
              // form.setValue('reportingManagerId', currentManager.id); // Ensure form value is set
              console.log(`[EmployeeForm - fetchManagers] Edit mode: Set selectedManagerName to '${currentManager.name + (currentManager.status !== 'Active' ? ' (Inactive)' : '')}' for manager ID ${employee.reportingManagerId}`);
            } else {
              setSelectedManagerName(""); // Manager ID exists in employee record but manager not found in list
              form.setValue('reportingManagerId', null); // Clear form value if manager not found
              console.warn(`[EmployeeForm - fetchManagers] Edit mode: Manager with ID ${employee.reportingManagerId} not found in fetched list. Cleared selection.`);
            }
          } else if (!isEditMode) {
            // For ADD mode, ensure no manager is pre-selected
            setSelectedManagerName("");
            // Set the form value to null as well, if it's not already
            if (form.getValues('reportingManagerId') !== null) {
                form.setValue('reportingManagerId', null, { shouldValidate: true, shouldDirty: true });
            }
            console.log("[EmployeeForm - fetchManagers] Add mode: Cleared selectedManagerName and ensured form value is null.");
          }

        } catch (error) {
          console.error("[EmployeeForm - fetchManagers] Error loading managers:", error);
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
    } else {
      // If user is not Admin/Manager, or role not yet determined, clear potential managers
      setPotentialManagers([]);
      setIsLoadingManagers(false); // Ensure loading state is reset
      console.log(`[EmployeeForm - fetchManagers effect] Role is ${currentUserRole}. Not fetching managers or cleared list.`);
    }
  }, [currentUserRole, isEditMode, employee?.id, employee?.reportingManagerId, toast, form]);


  const potentialManagersFiltered = React.useMemo(() => {
    if (!managerSearchTerm) return potentialManagers;
    return potentialManagers.filter(
      (manager) =>
        manager.name.toLowerCase().includes(managerSearchTerm.toLowerCase()) ||
        (manager.employeeId && manager.employeeId.toLowerCase().includes(managerSearchTerm.toLowerCase())) ||
        (manager.email && manager.email.toLowerCase().includes(managerSearchTerm.toLowerCase()))
    );
  }, [potentialManagers, managerSearchTerm]);

  const onSubmit = async (data: EmployeeFormShape) => {
    setIsLoading(true);
    console.log("[Employee Form] Submitting data (raw from form):", data);

    const payload = {
      ...data,
      phone: data.phone || undefined,
      gender: data.gender || undefined,
      dateOfBirth: data.dateOfBirth || null,
      reportingManagerId: data.reportingManagerId, // Should be null or a UUID string from form state
      workLocation: data.workLocation || undefined,
    };
    console.log("[Employee Form] Payload to be sent to API:", payload);

    // Call API route instead of action directly
    const apiUrl = isEditMode && employee?.id ? `/api/employees/${employee.id}` : '/api/employees';
    const method = isEditMode ? 'PUT' : 'POST';

    try {
        const response = await fetch(apiUrl, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        let result: any;
        let responseText: string | null = null;
        try {
            responseText = await response.text();
            if (responseText) result = JSON.parse(responseText);
            else if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`); 
        } catch (e) {
            if (!response.ok) { 
                console.error("[Employee Form] Error parsing API response, raw text:", responseText);
                throw new Error(responseText || `HTTP error! Status: ${response.status}`);
            }
            console.warn("[Employee Form] OK response but failed to parse JSON, raw text:", responseText);
            result = {}; 
        }

        if (!response.ok) {
             console.error("[Employee Form] API Error:", result);
             const errorMessage = result?.error || result?.message || result?.details?.[0]?.message || `Failed to ${isEditMode ? 'update' : 'add'} employee.`;
             
             let errorSetOnField = false;
             if (result?.details && Array.isArray(result.details)) {
                result.details.forEach((err: any) => {
                    const path = err.path?.[0] as keyof EmployeeFormShape | 'root.serverError' | undefined;
                    if (path && path !== 'root.serverError' && form.getFieldState(path as keyof EmployeeFormShape)) {
                        form.setError(path as keyof EmployeeFormShape, { type: "manual", message: err.message });
                        errorSetOnField = true;
                    }
                });
             }
             if (!errorSetOnField) {
                form.setError("root.serverError", { message: errorMessage });
             }
             throw new Error(errorMessage);
        }

        console.log("[Employee Form] API Success:", result);

        toast({
            title: `Employee ${isEditMode ? 'Updated' : 'Added'}`,
            description: `${result?.name || data.name} has been successfully ${isEditMode ? 'updated' : 'added'}. ${!isEditMode && result?.employeeId ? `Employee ID: ${result.employeeId}` : ''}`,
            className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
        });

        const targetPath = `/${tenantDomain}/employees`;
        router.push(isEditMode && employee?.id ? `/${tenantDomain}/employees/${employee.id}` : targetPath);
        router.refresh(); 

    } catch (error: any) {
        console.error("[Employee Form] Submission error (catch block):", error);
        if (!form.formState.errors.root?.serverError && !Object.values(form.formState.errors).some(fieldError => fieldError && fieldError.message)) {
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
  
  console.log(`[EmployeeForm - Render] isEditMode: ${isEditMode}, currentUserRole: ${currentUserRole}, potentialManagers.length: ${potentialManagers.length}, potentialManagersFiltered.length: ${potentialManagersFiltered.length}, managerSearchTerm: "${managerSearchTerm}"`);

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
                    <Input type="tel" placeholder="e.g. 123-456-7890" {...field} value={field.value ?? ""} disabled={isEmployeeRole && isEditMode && currentUserRole !== 'Admin' && currentUserRole !== 'Manager'} />
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
                    disabled={isEmployeeRole && isEditMode && currentUserRole !== 'Admin' && currentUserRole !== 'Manager'}
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
                          disabled={isEmployeeRole && isEditMode && currentUserRole !== 'Admin' && currentUserRole !== 'Manager'}
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
                        disabled={isEmployeeRole && isEditMode && currentUserRole !== 'Admin' && currentUserRole !== 'Manager'}
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
                            value={selectedManagerName || (isLoadingManagers && !field.value ? "Loading..." : (field.value ? selectedManagerName : "None selected"))}
                            placeholder="Select a manager"
                            className="flex-grow bg-background border border-input cursor-default"
                            onClick={() => { if (!isEmployeeRole) setIsManagerLookupOpen(true);}} // Open dialog on click if not employee
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
                            value={managerSearchTerm}
                            onChange={(e) => setManagerSearchTerm(e.target.value)}
                            className="pl-8"
                        />
                    </div>
                    <ScrollArea className="h-[300px] border rounded-md">
                        {isLoadingManagers ? (
                             <div className="p-4 text-center text-sm text-muted-foreground">Loading managers... <Loader2 className="inline h-4 w-4 animate-spin" /></div>
                        ) : potentialManagersFiltered.length > 0 ? (
                            potentialManagersFiltered.map((manager) => (
                                <Button
                                    key={manager.id}
                                    variant="ghost"
                                    className="w-full justify-start h-auto py-2 px-3 text-left hover:bg-accent"
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
                                {"No active managers found" + (managerSearchTerm ? " matching your search." : ".")}
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

        <div className="flex justify-end gap-2 pt-4 border-t mt-6">
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading || (!form.formState.isDirty && isEditMode && !isEmployeeRole) || (isEmployeeRole && !form.formState.isDirty )}>
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

    