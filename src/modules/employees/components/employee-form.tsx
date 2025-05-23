
"use client";

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { employeeSchema, type EmployeeFormData, employmentTypeSchema, genderSchema, type Employee, employeeStatusSchema } from '@/modules/employees/types';
import type { UserRole } from '@/modules/auth/types';
import { userRoleSchema } from '@/modules/auth/types';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CalendarIcon, Save, UserPlus, Search, XCircle } from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
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

type EmployeeFormShape = EmployeeFormData;

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
  const isEmployeeRoleActing = currentUserRole === 'Employee';
  const isUserAdmin = currentUserRole === 'Admin';

  const getFormattedDate = (dateString?: string | null): string | undefined => {
    if (!dateString) return undefined;
    try {
      const parsedDate = parseISO(dateString);
      return isValid(parsedDate) ? format(parsedDate, 'yyyy-MM-dd') : undefined;
    } catch (e) { return undefined; }
  };

  const formSchemaForValidation = employeeSchema.omit({ 
      id: true, tenantId: true, userId: true, employeeId: true, 
      name: true, created_at: true, updated_at: true, is_active: true 
  });

  const form = useForm<EmployeeFormShape>({
    resolver: zodResolver(formSchemaForValidation),
    defaultValues: {
      first_name: employee?.first_name ?? "",
      middle_name: employee?.middle_name ?? "",
      last_name: employee?.last_name ?? "",
      email: employee?.email ?? "",
      personal_email: employee?.personal_email ?? "",
      phone: employee?.phone ?? "",
      gender: employee?.gender ?? undefined,
      dateOfBirth: getFormattedDate(employee?.dateOfBirth),
      marital_status: employee?.marital_status ?? "",
      nationality: employee?.nationality ?? "",
      blood_group: employee?.blood_group ?? "",
      emergency_contact_name: employee?.emergency_contact_name ?? "",
      emergency_contact_number: employee?.emergency_contact_number ?? "",
      
      position: employee?.position ?? "",
      department: employee?.department ?? "",
      workLocation: employee?.workLocation ?? "",
      employmentType: employee?.employmentType ?? "Full-time",
      hireDate: getFormattedDate(employee?.hireDate),
      status: employee?.status ?? "Active",
      reportingManagerId: employee?.reportingManagerId || null,
      role: employee?.role ?? 'Employee',
    },
  });

  React.useEffect(() => {
    if (currentUserRole === 'Admin' || currentUserRole === 'Manager') {
      const fetchManagers = async () => {
        setIsLoadingManagers(true);
        console.log(`[EmployeeForm - fetchManagers effect] Role: ${currentUserRole}. Fetching managers. isEditMode: ${isEditMode}, employeeId (PK being edited): ${employee?.id}`);
        try {
          const response = await fetch('/api/employees');
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Failed to fetch employees for manager list.' }));
            console.error("[EmployeeForm - fetchManagers] API error:", errorData);
            throw new Error(errorData.message || 'Failed to fetch potential managers');
          }
          const data: Employee[] = await response.json();
          console.log(`[EmployeeForm - fetchManagers] Employees fetched from API: ${data.length}`);
          
          const filteredData = data.filter(e => 
            e.status === 'Active' && 
            (isEditMode ? e.id !== employee?.id : true) // Exclude self if editing
          );
          setPotentialManagers(filteredData);
          console.log(`[EmployeeForm - fetchManagers] Potential managers after filtering: ${filteredData.length}`);

          if (isEditMode && employee?.reportingManagerId) {
            let currentManager = filteredData.find(m => m.id === employee.reportingManagerId);
            if (!currentManager) { // If not in active filtered list, check original data (might be inactive now)
                currentManager = data.find(m => m.id === employee.reportingManagerId);
            }
            if (currentManager) {
              setSelectedManagerName(currentManager.name + (currentManager.status !== 'Active' ? ' (Inactive)' : ''));
            } else {
              setSelectedManagerName("");
              form.setValue('reportingManagerId', null);
              console.warn(`[EmployeeForm - fetchManagers] Edit mode: Manager with ID ${employee.reportingManagerId} not found. Cleared selection.`);
            }
          } else if (!isEditMode) {
            setSelectedManagerName("");
            if (form.getValues('reportingManagerId') !== null) { // Reset if form had a value but it's add mode
                form.setValue('reportingManagerId', null, { shouldValidate: true, shouldDirty: true });
            }
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
      setPotentialManagers([]);
      setIsLoadingManagers(false);
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

    const payload: EmployeeFormData = {
      ...data,
      middle_name: data.middle_name || null,
      personal_email: data.personal_email || null,
      phone: data.phone || null,
      gender: data.gender || null,
      dateOfBirth: data.dateOfBirth || null,
      marital_status: data.marital_status || null,
      nationality: data.nationality || null,
      blood_group: data.blood_group || null,
      emergency_contact_name: data.emergency_contact_name || null,
      emergency_contact_number: data.emergency_contact_number || null,
      reportingManagerId: data.reportingManagerId === NO_MANAGER_VALUE ? null : (data.reportingManagerId || null),
      position: data.position || null,
      department: data.department || null,
      workLocation: data.workLocation || null,
      hireDate: data.hireDate || null,
      role: data.role || 'Employee', // Ensure role is passed
    };
    console.log("[Employee Form] Payload to be sent to API:", payload);

    try {
        let result;
        let responseData;
        if (isEditMode && employee?.id) {
            result = await fetch(`/api/employees/${employee.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload), 
            });
        } else {
            result = await fetch('/api/employees', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload), 
            });
        }

        responseData = await result.json();

        if (!result.ok) {
             console.error("[Employee Form] API Error Response:", responseData);
             const errorMessage = responseData?.error || responseData?.message || responseData?.details?.[0]?.message || `Failed to ${isEditMode ? 'update' : 'add'} employee.`;
             let errorSetOnField = false;
             if (responseData?.details && Array.isArray(responseData.details)) {
                responseData.details.forEach((err: any) => {
                    const path = err.path?.[0] as keyof EmployeeFormShape | 'root.serverError' | undefined;
                    if (path && path !== 'root.serverError' && form.getFieldState(path as keyof EmployeeFormShape)) {
                        form.setError(path as keyof EmployeeFormShape, { type: "server", message: err.message });
                        errorSetOnField = true;
                    }
                });
             }
             if (!errorSetOnField) {
                form.setError("root.serverError", { message: errorMessage });
             }
             throw new Error(errorMessage);
        }

        console.log("[Employee Form] API Success:", responseData);
        toast({
            title: `Employee ${isEditMode ? 'Updated' : 'Added'}`,
            description: `${responseData?.name || payload.first_name + ' ' + payload.last_name} has been successfully ${isEditMode ? 'updated' : 'added'}. ${!isEditMode && responseData?.employeeId ? `Employee ID: ${responseData.employeeId}` : ''}`,
            className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
        });

        const targetPath = `/${tenantDomain}/employees`;
        router.push(isEditMode && responseData?.id ? `/${tenantDomain}/employees/${responseData.id}` : targetPath);
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
  
  const canEditSensitiveFields = isUserAdmin || (currentUserRole === 'Manager' && !isEditMode); // Managers can set on create

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
         {form.formState.errors.root?.serverError && (
          <FormMessage className="text-destructive text-center bg-destructive/10 p-3 rounded-md">
            {form.formState.errors.root.serverError.message}
          </FormMessage>
        )}

        <h3 className="text-lg font-medium border-b pb-2">Personal Information</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FormField control={form.control} name="first_name" render={({ field }) => (
                <FormItem><FormLabel>First Name *</FormLabel><FormControl><Input placeholder="e.g. Jane" {...field} disabled={isEmployeeRoleActing && isEditMode} /></FormControl><FormMessage /></FormItem>
            )}/>
            <FormField control={form.control} name="middle_name" render={({ field }) => (
                <FormItem><FormLabel>Middle Name</FormLabel><FormControl><Input placeholder="Optional" {...field} value={field.value ?? ""} disabled={isEmployeeRoleActing && isEditMode} /></FormControl><FormMessage /></FormItem>
            )}/>
            <FormField control={form.control} name="last_name" render={({ field }) => (
                <FormItem><FormLabel>Last Name *</FormLabel><FormControl><Input placeholder="e.g. Doe" {...field} disabled={isEmployeeRoleActing && isEditMode} /></FormControl><FormMessage /></FormItem>
            )}/>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField control={form.control} name="dateOfBirth" render={({ field }) => (
                <FormItem className="flex flex-col pt-2"><FormLabel>Date of Birth</FormLabel><Popover open={dobDatePickerOpen} onOpenChange={setDobDatePickerOpen}><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                    {field.value && isValid(parseISO(field.value)) ? format(parseISO(field.value), "PPP") : <span>Pick a date</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={field.value && isValid(parseISO(field.value)) ? parseISO(field.value) : undefined} onSelect={(date) => { field.onChange(date ? format(date, 'yyyy-MM-dd') : ""); setDobDatePickerOpen(false);}} captionLayout="dropdown-buttons" fromYear={1950} toYear={new Date().getFullYear() - 18} initialFocus /></PopoverContent></Popover><FormMessage /></FormItem>
            )}/>
            <FormField control={form.control} name="gender" render={({ field }) => (
                <FormItem className="pt-2"><FormLabel>Gender</FormLabel><Select onValueChange={field.onChange} value={field.value ?? undefined}><FormControl><SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger></FormControl><SelectContent>
                    <SelectItem value={NO_MANAGER_VALUE}>-- Not Specified --</SelectItem>{genderSchema.options.map(option => (<SelectItem key={option} value={option}>{option}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>
            )}/>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
             <FormField control={form.control} name="marital_status" render={({ field }) => (
                <FormItem><FormLabel>Marital Status</FormLabel><FormControl><Input placeholder="e.g. Single, Married" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
            )}/>
            <FormField control={form.control} name="nationality" render={({ field }) => (
                <FormItem><FormLabel>Nationality</FormLabel><FormControl><Input placeholder="e.g. American" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
            )}/>
            <FormField control={form.control} name="blood_group" render={({ field }) => (
                <FormItem><FormLabel>Blood Group</FormLabel><FormControl><Input placeholder="e.g. O+" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
            )}/>
        </div>

        <h3 className="text-lg font-medium border-b pb-2 pt-4">Contact Information</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem><FormLabel>Official Email *</FormLabel><FormControl><Input type="email" placeholder="e.g. jane.doe@company.com" {...field} disabled={!canEditSensitiveFields && isEditMode} /></FormControl><FormMessage /></FormItem>
            )}/>
            <FormField control={form.control} name="personal_email" render={({ field }) => (
                <FormItem><FormLabel>Personal Email</FormLabel><FormControl><Input type="email" placeholder="e.g. jane@personal.com" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
            )}/>
            <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem><FormLabel>Phone Number</FormLabel><FormControl><Input type="tel" placeholder="e.g. 123-456-7890" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
            )}/>
        </div>
         <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
             <FormField control={form.control} name="emergency_contact_name" render={({ field }) => (
                <FormItem><FormLabel>Emergency Contact Name</FormLabel><FormControl><Input placeholder="e.g. John Smith" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
            )}/>
            <FormField control={form.control} name="emergency_contact_number" render={({ field }) => (
                <FormItem><FormLabel>Emergency Contact Number</FormLabel><FormControl><Input type="tel" placeholder="e.g. 987-654-3210" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
            )}/>
        </div>

        <h3 className="text-lg font-medium border-b pb-2 pt-4">Employment Information</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField control={form.control} name="position" render={({ field }) => (
                <FormItem><FormLabel>Position / Job Title *</FormLabel><FormControl><Input placeholder="e.g. Software Engineer" {...field} value={field.value ?? ""} disabled={isEmployeeRoleActing && isEditMode} /></FormControl><FormMessage /></FormItem>
            )}/>
            <FormField control={form.control} name="department" render={({ field }) => (
                <FormItem><FormLabel>Department *</FormLabel><FormControl><Input placeholder="e.g. Technology" {...field} value={field.value ?? ""} disabled={isEmployeeRoleActing && isEditMode} /></FormControl><FormMessage /></FormItem>
            )}/>
        </div>

        {isUserAdmin && !isEditMode && ( // Only Admin can set role on creation
            <FormField control={form.control} name="role" render={({ field }) => (
                <FormItem><FormLabel>User Role *</FormLabel><Select onValueChange={field.onChange} value={field.value ?? 'Employee'} defaultValue={field.value ?? 'Employee'}><FormControl><SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger></FormControl><SelectContent>
                    {userRoleSchema.options.map(roleValue => (<SelectItem key={roleValue} value={roleValue}>{roleValue}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>
            )}/>
        )}
         {isEditMode && employee?.role && ( // Display role if editing, but don't allow change via this form
            <FormItem><FormLabel>User Role</FormLabel><Input value={employee.role} readOnly className="bg-muted" /></FormItem>
         )}


        <FormField control={form.control} name="reportingManagerId" render={({ field }) => (
            <FormItem><FormLabel>Reporting Manager</FormLabel><div className="flex items-center gap-2">
                <Input readOnly value={selectedManagerName || (isLoadingManagers && !field.value ? "Loading..." : (field.value && field.value !== NO_MANAGER_VALUE ? selectedManagerName : "None selected"))} placeholder="Select a manager" className="flex-grow bg-background border border-input cursor-default" onClick={() => { if (!isEmployeeRoleActing || !isEditMode) setIsManagerLookupOpen(true);}} disabled={isEmployeeRoleActing && isEditMode} />
                <Button type="button" variant="outline" onClick={() => setIsManagerLookupOpen(true)} disabled={isLoadingManagers || (isEmployeeRoleActing && isEditMode)} className="shrink-0"><Search className="mr-2 h-4 w-4" />{selectedManagerName ? "Change" : "Select"}</Button>
                {(selectedManagerName || field.value === NO_MANAGER_VALUE) && (<Button type="button" variant="ghost" size="icon" onClick={() => { field.onChange(null); setSelectedManagerName("");}} disabled={isEmployeeRoleActing && isEditMode} className="shrink-0 text-muted-foreground hover:text-destructive" title="Clear manager selection"><XCircle className="h-4 w-4" /></Button>)}
            </div><FormMessage /></FormItem>
        )}/>

        <Dialog open={isManagerLookupOpen} onOpenChange={setIsManagerLookupOpen}>
            <DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Select Reporting Manager</DialogTitle></DialogHeader><div className="py-4 space-y-4">
                <div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input type="text" placeholder="Search managers..." value={managerSearchTerm} onChange={(e) => setManagerSearchTerm(e.target.value)} className="pl-8" /></div>
                <ScrollArea className="h-[300px] border rounded-md">{isLoadingManagers ? (<div className="p-4 text-center text-sm text-muted-foreground">Loading managers... <Loader2 className="inline h-4 w-4 animate-spin" /></div>) : potentialManagersFiltered.length > 0 ? (<>
                    <Button key={NO_MANAGER_VALUE} variant="ghost" className="w-full justify-start h-auto py-2 px-3 text-left hover:bg-accent" onClick={() => { form.setValue('reportingManagerId', null, { shouldValidate: true, shouldDirty: true }); setSelectedManagerName("-- None --"); setIsManagerLookupOpen(false);}}>-- None --</Button>
                    {potentialManagersFiltered.map((manager) => (<Button key={manager.id} variant="ghost" className="w-full justify-start h-auto py-2 px-3 text-left hover:bg-accent" onClick={() => { form.setValue('reportingManagerId', manager.id, { shouldValidate: true, shouldDirty: true }); setSelectedManagerName(manager.name); setIsManagerLookupOpen(false);}}><div className="flex flex-col"><span>{manager.name}</span><span className="text-xs text-muted-foreground">{manager.position} ({manager.employeeId || manager.email})</span></div></Button>))}
                </>) : (<p className="p-4 text-center text-sm text-muted-foreground">{"No active managers found" + (managerSearchTerm ? " matching your search." : ".")}</p>)}</ScrollArea>
            </div><DialogClose asChild><Button type="button" variant="outline" className="mt-2">Cancel</Button></DialogClose></DialogContent>
        </Dialog>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField control={form.control} name="employmentType" render={({ field }) => (
                <FormItem><FormLabel>Employment Type *</FormLabel><Select onValueChange={field.onChange} value={field.value ?? "Full-time"} disabled={isEmployeeRoleActing && isEditMode}><FormControl><SelectTrigger><SelectValue placeholder="Select employment type" /></SelectTrigger></FormControl><SelectContent>
                    {employmentTypeSchema.options.map(type => (<SelectItem key={type} value={type}>{type}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>
            )}/>
            <FormField control={form.control} name="hireDate" render={({ field }) => (
                <FormItem className="flex flex-col pt-2"><FormLabel>Hire Date *</FormLabel><Popover open={hireDatePickerOpen} onOpenChange={setHireDatePickerOpen}><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal",!field.value && "text-muted-foreground")} disabled={(isEmployeeRoleActing && isEditMode)} >
                    {field.value && isValid(parseISO(field.value)) ? format(parseISO(field.value), "PPP") : <span>Pick a date</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={field.value && isValid(parseISO(field.value)) ? parseISO(field.value) : undefined} onSelect={(date) => { field.onChange(date ? format(date, 'yyyy-MM-dd') : ""); setHireDatePickerOpen(false);}} disabled={(date) => (date > new Date() || date < new Date("1900-01-01")) || (isEmployeeRoleActing && isEditMode)} initialFocus /></PopoverContent></Popover><FormMessage /></FormItem>
            )}/>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField control={form.control} name="workLocation" render={({ field }) => (
                <FormItem><FormLabel>Work Location</FormLabel><FormControl><Input placeholder="e.g. Main Office, Remote" {...field} value={field.value ?? ""} disabled={isEmployeeRoleActing && isEditMode} /></FormControl><FormMessage /></FormItem>
            )}/>
            <FormField control={form.control} name="status" render={({ field }) => (
                <FormItem><FormLabel>Employee Status *</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={isEmployeeRoleActing && isEditMode}><FormControl><SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger></FormControl><SelectContent>
                    {employeeStatusSchema.options.map(status => (<SelectItem key={status} value={status}>{status}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>
            )}/>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t mt-6">
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={isLoading}>Cancel</Button>
          <Button type="submit" disabled={isLoading || (!form.formState.isDirty && isEditMode) }>
            {isLoading ? (<Loader2 className="mr-2 h-4 w-4 animate-spin" />) : (isEditMode ? <Save className="mr-2 h-4 w-4" /> : <UserPlus className="mr-2 h-4 w-4" />)}
            {isLoading ? 'Saving...' : actualSubmitButtonText}
          </Button>
        </div>
      </form>
    </Form>
  );
}
