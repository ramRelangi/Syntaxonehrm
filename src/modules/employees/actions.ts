
'use server';

import type { Employee, EmployeeFormData } from '@/modules/employees/types';
import { employeeSchema, userRoleSchema } from '@/modules/employees/types'; // Corrected: userRoleSchema is in employees/types, not auth/types for this context
import {
  getAllEmployees as dbGetAllEmployees,
  getEmployeeById as dbGetEmployeeById,
  addEmployeeInternal as dbAddEmployeeInternal,
  updateEmployee as dbUpdateEmployee,
  deleteEmployee as dbDeleteEmployee,
  getEmployeeByUserId as dbGetEmployeeByUserId,
} from '@/modules/employees/lib/db';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import {
    getSessionData,
    sendEmployeeWelcomeEmail,
} from '@/modules/auth/actions';
import { addUser as dbAddUser } from '@/modules/auth/lib/db';
import { generateTemporaryPassword } from '@/modules/auth/lib/utils';
import bcrypt from 'bcrypt';
import type { SessionData, UserRole } from '@/modules/auth/types';

const SALT_ROUNDS = 10;

// Schema for validating form data for add/update actions
// It omits server-generated IDs but includes fields that are now directly on employees table
const actionEmployeeSchema = employeeSchema.omit({ tenantId: true, userId: true, employeeId: true, name: true }).extend({
    reportingManagerId: z.string().uuid("Invalid manager ID format.").nullable().optional(),
    // Role is for the user account, handled during user creation
});


export async function getEmployees(): Promise<Employee[]> {
  console.log("[Action getEmployees] Initiating fetch.");
  let sessionData: SessionData | null;
  try {
    sessionData = await getSessionData();
    if (!sessionData?.tenantId || !sessionData.userRole || !sessionData.userId) {
      console.error("[Action getEmployees] Critical: Incomplete session data:", sessionData);
      throw new Error("Tenant context, user role, or user ID missing from session. Unable to determine permissions.");
    }
    console.log(`[Action getEmployees] Session data retrieved: tenantId=${sessionData.tenantId}, userRole=${sessionData.userRole}, userId=${sessionData.userId}`);
  } catch (e: any) {
    console.error("[Action getEmployees] Error fetching session data:", e.message, e.stack ? e.stack : '(No stack trace)');
    throw new Error("Failed to retrieve session context: " + e.message);
  }

  const { tenantId, userRole, userId } = sessionData;

  try {
    if (userRole === 'Employee') {
      console.log(`[Action getEmployees] Employee role, attempting to fetch own profile for session user: ${userId} in tenant: ${tenantId}`);
      const employeeProfile = await dbGetEmployeeByUserId(userId, tenantId);
      if (employeeProfile) {
        console.log(`[Action getEmployees] Found own profile for employee ${userId}.`);
        return [employeeProfile];
      } else {
        console.warn(`[Action getEmployees] No profile found for employee ${userId} in tenant ${tenantId}. Returning empty array.`);
        return [];
      }
    }
    console.log(`[Action getEmployees] Admin/Manager role, fetching all employees for tenant: ${tenantId}`);
    const employees = await dbGetAllEmployees(tenantId);
    console.log(`[Action getEmployees] Fetched ${employees.length} employees for tenant ${tenantId}.`);
    return employees;
  } catch (dbError: any) {
    console.error(`[Action getEmployees] Database error for tenant ${tenantId}:`, dbError);
    throw new Error(`Failed to fetch employees from database: ${dbError.message}`);
  }
}

export async function getEmployeeByIdAction(id: string): Promise<Employee | undefined> {
    console.log(`[Action getEmployeeByIdAction] Received ID param to fetch: ${id}`);
    let sessionData: SessionData | null;
    try {
        sessionData = await getSessionData();
         if (!sessionData?.tenantId || !sessionData.userRole || !sessionData.userId) {
            console.error(`[Action getEmployeeByIdAction] Incomplete session for ID ${id}: tenantId=${sessionData?.tenantId}, userRole=${sessionData?.userRole}, currentUserId=${sessionData?.userId}`);
            throw new Error("Incomplete session data. Cannot authorize request.");
        }
         console.log(`[Action getEmployeeByIdAction] Session - currentUserId: ${sessionData.userId}, tenantId: ${sessionData.tenantId}, userRole: ${sessionData.userRole}`);
    } catch (e: any) {
        console.error(`[Action getEmployeeByIdAction] Error fetching session data for ID ${id}:`, e);
        throw new Error(`Session retrieval failed: ${e.message}`);
    }

    const { tenantId, userRole, userId: currentUserId } = sessionData;
    const idToQuery = id.toLowerCase();
    const tenantIdToQuery = tenantId.toLowerCase();
    const currentUserIdLower = currentUserId.toLowerCase();

    try {
        let employeeProfile: Employee | undefined;

        if (userRole === 'Employee') {
            console.log(`[Action getEmployeeByIdAction] Employee role. URL param id: ${idToQuery}. Session userId: ${currentUserIdLower}`);
            if (idToQuery !== currentUserIdLower) {
                console.warn(`[Action getEmployeeByIdAction] Auth_Warning (Employee Role): Attempt to access profile where URL ID '${idToQuery}' (expected to be employee.id for edit links) does not match session userId '${currentUserIdLower}'. This implies an edit attempt for another user or a MyProfile link using employee.id. Fetching by employee.id '${idToQuery}' to verify ownership.`);
                employeeProfile = await dbGetEmployeeById(idToQuery, tenantIdToQuery);
                if (employeeProfile) {
                    console.log(`[Action getEmployeeByIdAction] Fetched employee by PK ${idToQuery}. Record details: ID=${employeeProfile.id}, Linked_UserID_On_Record=${employeeProfile.userId}, Name=${employeeProfile.name}`);
                    if (employeeProfile.userId?.toLowerCase() !== currentUserIdLower) {
                        console.warn(`[Action getEmployeeByIdAction] Auth_Failed (Employee Role): Attempt to access/edit profile for Employee PK ${idToQuery}. Record's linked user_id (${employeeProfile.userId}) does NOT match session userId (${currentUserIdLower}).`);
                        throw new Error("Unauthorized: You can only view/edit your own employee profile.");
                    }
                    console.log(`[Action getEmployeeByIdAction] Auth_Success (Employee Role): Employee PK ${idToQuery} belongs to session user ${currentUserIdLower}.`);
                } else {
                    console.warn(`[Action getEmployeeByIdAction] Auth_Failed (Employee Role): Employee PK ${idToQuery} not found for tenant ${tenantIdToQuery}.`);
                    throw new Error("Employee profile not found.");
                }
            } else { // idToQuery (from URL) === currentUserIdLower (from session) -> This is for "My Profile" view
                console.log(`[Action getEmployeeByIdAction] Employee role. ID from URL matches session userId. Fetching own profile using dbGetEmployeeByUserId with userId: ${idToQuery}, tenantId: ${tenantIdToQuery}`);
                employeeProfile = await dbGetEmployeeByUserId(idToQuery, tenantIdToQuery);
                 if (employeeProfile) {
                     console.log(`[Action getEmployeeByIdAction] dbGetEmployeeByUserId SUCCESS for own profile. Fetched Employee PK: ${employeeProfile.id}, Name: ${employeeProfile.name}`);
                } else {
                    console.warn(`[Action getEmployeeByIdAction] dbGetEmployeeByUserId FAILED to find profile for current user. userId: ${idToQuery}, tenantId: ${tenantIdToQuery}.`);
                }
            }
        } else { // Admin or Manager
            console.log(`[Action getEmployeeByIdAction] Admin/Manager role. Fetching employee by primary key (employee.id): ${idToQuery} for tenant: ${tenantIdToQuery}`);
            employeeProfile = await dbGetEmployeeById(idToQuery, tenantIdToQuery);
            if (employeeProfile) {
                console.log(`[Action getEmployeeByIdAction] dbGetEmployeeById SUCCESS: Found employee ${employeeProfile.id} (PK). Name: ${employeeProfile.name}`);
            } else {
                console.warn(`[Action getEmployeeByIdAction] dbGetEmployeeById FAILED: Employee profile NOT found for employee.id (PK) ${idToQuery} in tenant ${tenantIdToQuery}.`);
            }
        }

        if (!employeeProfile) {
            console.log(`[Action getEmployeeByIdAction] Final check: No employee profile found for id ${idToQuery} in tenant ${tenantIdToQuery} with role ${userRole}.`);
            throw new Error("Employee not found.");
        }
        return employeeProfile;

    } catch (error: any) {
        console.error(`[Action getEmployeeByIdAction] Error processing request for employee ID ${id} (tenant: ${tenantId}):`, error);
        let friendlyMessage = `Failed to fetch employee details.`;
        if (error.message?.toLowerCase().includes('unauthorized')) {
            friendlyMessage = error.message;
        } else if (error.code && typeof error.code === 'string') {
            friendlyMessage = `Database error (code ${error.code}) retrieving employee.`;
        } else if (error.message) {
            const prefix = "Error: ";
            friendlyMessage = error.message.startsWith(prefix) ? error.message.substring(prefix.length) : error.message;
        }
        throw new Error(friendlyMessage);
    }
}


export async function addEmployee(formData: EmployeeFormData): Promise<{ success: boolean; employee?: Employee; errors?: z.ZodIssue[] | { code: string; path: (string|number)[]; message: string }[] }> {
   console.log("[Action addEmployee] Received formData (raw from form):", JSON.stringify(formData, null, 2));
   let sessionData: SessionData | null;
   try {
       sessionData = await getSessionData();
       if (!sessionData?.tenantId || !sessionData?.userRole || !sessionData?.tenantDomain) {
           console.error("[Action addEmployee] Incomplete session data:", sessionData);
           throw new Error("Incomplete session data. TenantId, UserRole, or TenantDomain is missing.");
       }
       console.log(`[Action addEmployee] Session data retrieved: tenantId=${sessionData.tenantId}, userRole=${sessionData.userRole}, tenantDomain=${sessionData.tenantDomain}`);
   } catch (e: any) {
       console.error("[Action addEmployee] Error fetching session data:", e);
       return { success: false, errors: [{ code: 'custom', path: ['root'], message: 'Failed to verify session: ' + e.message }] };
   }

   const { tenantId, userRole: userRolePerformingAction, tenantDomain } = sessionData;

   if (userRolePerformingAction !== 'Admin' && userRolePerformingAction !== 'Manager') {
        console.warn(`[Action addEmployee] Unauthorized attempt to add employee for tenant ${tenantId}. User role: ${userRolePerformingAction}`);
        return { success: false, errors: [{ code: 'custom', path: ['root'], message: 'Unauthorized to add employees.' }] };
   }
   console.log(`[Action addEmployee] Attempting to add employee for tenant: ${tenantId}`);

    // Prepare data for validation, explicitly handling reportingManagerId
    const dataForValidation = {
        ...formData,
        reportingManagerId: formData.reportingManagerId || null, // Ensure null if empty/undefined
        role: formData.role || 'Employee', // Default role for user account
    };
   console.log("[Action addEmployee] Data for Zod validation:", JSON.stringify(dataForValidation, null, 2));

   const validation = actionEmployeeSchema.safeParse(dataForValidation);

  if (!validation.success) {
    console.error("[Action addEmployee] Zod Validation Errors:", validation.error.flatten());
    return { success: false, errors: validation.error.errors };
  }
  console.log("[Action addEmployee] Zod Validation successful. Validated data:", JSON.stringify(validation.data, null, 2));

  // Destructure all relevant fields from validation.data
  const {
      first_name, middle_name, last_name, email, personal_email, phone, gender, dateOfBirth,
      marital_status, nationality, blood_group, emergency_contact_name, emergency_contact_number,
      status, reportingManagerId, position, department, workLocation, employmentType, hireDate,
      role: employeeRoleForUser // This is the role for the users table
  } = validation.data;

  let actualRoleToSet: UserRole = employeeRoleForUser || 'Employee';
  if (userRolePerformingAction === 'Manager' && actualRoleToSet !== 'Employee') {
      console.warn(`[Action addEmployee] Manager attempting to set role to ${actualRoleToSet}. Forcing to 'Employee'.`);
      actualRoleToSet = 'Employee';
  }

  // Prepare the data specifically for dbAddEmployeeInternal
  const employeeDataForDb: Omit<EmployeeFormData, 'name' | 'role'> & { tenantId: string, userId: string, status: Employee['status'], role: UserRole } = {
    first_name, middle_name, last_name, email, personal_email, phone, gender, dateOfBirth,
    marital_status, nationality, blood_group, emergency_contact_name, emergency_contact_number,
    status: status || 'Active', // Ensure status has a default for DB
    reportingManagerId: reportingManagerId === "" ? null : reportingManagerId, // Ensure null if empty string
    position, department, workLocation, employmentType, hireDate,
    // These are added contextually before calling dbAddEmployeeInternal
    tenantId: "", // Will be set
    userId: "",   // Will be set
    is_active: (status || 'Active') === 'Active', // is_active derived from status
    role: actualRoleToSet, // This role is for the user, passed to dbAddUser
  };


  try {
    console.log("[Action addEmployee] Creating user and employee...");

    const temporaryPassword = generateTemporaryPassword(12);
    console.log('[Action addEmployee] Generated temporary password length:', temporaryPassword.length);
    const passwordHash = await bcrypt.hash(temporaryPassword, SALT_ROUNDS);
    let newUser;
    try {
        newUser = await dbAddUser({
            tenantId,
            email,
            username: email, // Using email as username for simplicity; can be changed
            passwordHash,
            name: `${first_name} ${last_name}`,
            role: actualRoleToSet,
            is_active: true,
            employee_id: undefined, // employee_id (PK from employees) will be linked later if needed by FK in users
        });
    } catch (userError: any) {
        console.error("[Action addEmployee] Error creating user in users table:", userError);
        return { success: false, errors: [{ code: 'custom', path: ['email'], message: userError.message || 'Failed to create user account for employee.' }] };
    }
    console.log(`[Action addEmployee] User account created with ID: ${newUser.user_id} and Role: ${actualRoleToSet}`);

    // Update employeeDataForDb with actual tenantId and userId
    employeeDataForDb.tenantId = tenantId;
    employeeDataForDb.userId = newUser.user_id;

    const newEmployee = await dbAddEmployeeInternal(employeeDataForDb);
    console.log(`[Action addEmployee] Employee record added successfully (ID: ${newEmployee.id}, EmployeeID: ${newEmployee.employeeId}).`);

    try {
        console.log(`[Action addEmployee] Attempting to queue welcome email for ${newEmployee.email} to ${tenantDomain}...`);
        const emailSent = await sendEmployeeWelcomeEmail(
            tenantId,
            newEmployee.name,
            newEmployee.email,
            newUser.user_id,
            newEmployee.employeeId!,
            temporaryPassword,
            tenantDomain
        );
        if (emailSent) {
            console.log(`[Action addEmployee] Employee welcome email for ${newEmployee.email} queued successfully.`);
        } else {
            console.error(`[Action addEmployee] Employee welcome email for ${newEmployee.email} failed to send (logged separately).`);
        }
    } catch (emailError: any) {
        console.error(`[Action addEmployee] Error calling sendEmployeeWelcomeEmail: ${emailError.message}`, emailError.stack ? emailError.stack : '(No stack trace)');
    }

    revalidatePath(`/${tenantDomain}/employees`);
    revalidatePath(`/${tenantDomain}/dashboard`);

    return { success: true, employee: newEmployee };
  } catch (error: any) {
    console.error("[Action addEmployee] Caught error object:", error);
    if (error.stack) {
        console.error("[Action addEmployee] Error stack:", error.stack);
    }
    let errorMessage = "An unexpected error occurred while adding the employee. Please check server logs.";
    let errorPath: (string|number)[] = ['root'];
    if (error.message) {
        const prefix = "Error: ";
        errorMessage = error.message.startsWith(prefix) ? error.message.substring(prefix.length) : error.message;
        if (error.message.includes('Email address already exists')) errorPath = ['email'];
        else if (error.message.toLowerCase().includes('invalid manager id format')) errorPath = ['reportingManagerId'];
    }
    if (error.code && typeof error.code === 'string') {
        errorMessage = `Database error (code ${error.code}). ${errorMessage}`;
    }

     return { success: false, errors: [{ code: 'custom', path: errorPath, message: errorMessage }] };
  }
}

export async function updateEmployee(id: string, formData: Partial<Omit<EmployeeFormData, 'role'>> & { role?: UserRole }): Promise<{ success: boolean; employee?: Employee; errors?: z.ZodIssue[] | { code: string; path: (string|number)[]; message: string }[] }> {
   console.log(`[Action updateEmployee] Received formData for ID ${id}:`, JSON.stringify(formData, null, 2));
   let sessionData: SessionData | null;
   try {
       sessionData = await getSessionData();
       if (!sessionData?.tenantId || !sessionData?.userRole || !sessionData?.userId || !sessionData?.tenantDomain) {
           console.error("[Action updateEmployee] Incomplete session data:", sessionData);
           throw new Error("Incomplete session data.");
       }
   } catch (e: any) {
       console.error("[Action updateEmployee] Error fetching session data:", e.message);
       return { success: false, errors: [{ code: 'custom', path: ['root'], message: 'Failed to verify session: ' + e.message }] };
   }

   const { tenantId, userRole: userRolePerformingAction, userId: currentUserIdPerformingAction, tenantDomain } = sessionData;

    const employeeToUpdate = await dbGetEmployeeById(id.toLowerCase(), tenantId); // Fetch by Employee PK
    if (!employeeToUpdate) {
        console.warn(`[Action updateEmployee] Employee PK ${id} not found for tenant ${tenantId}.`);
        return { success: false, errors: [{ code: 'custom', path: ['id'], message: 'Employee not found.' }] };
    }

   let dataForValidation: Partial<EmployeeFormData> & { role?: UserRole } = { ...formData };

    if (userRolePerformingAction === 'Employee') {
        // Employee can only edit their own profile and limited fields
        if (employeeToUpdate.userId?.toLowerCase() !== currentUserIdPerformingAction.toLowerCase()) {
            console.warn(`[Action updateEmployee] Auth_Failed (Employee Role): Attempt to update employee PK ${id}. Record's user_id (${employeeToUpdate.userId}) != session userId (${currentUserIdPerformingAction}).`);
            return { success: false, errors: [{ code: 'custom', path: ['root'], message: 'Unauthorized to update this employee profile.' }] };
        }
        const allowedUpdates: Partial<EmployeeFormData> = {};
        if (formData.phone !== undefined) allowedUpdates.phone = formData.phone;
        if (formData.dateOfBirth !== undefined) allowedUpdates.dateOfBirth = formData.dateOfBirth;
        if (formData.personal_email !== undefined) allowedUpdates.personal_email = formData.personal_email;
        // Add other allowed fields here if necessary (e.g., marital_status, emergency contacts)

        const disallowedKeys = Object.keys(formData).filter(key => !['phone', 'dateOfBirth', 'personal_email'].includes(key)); // update with allowed keys
        if (disallowedKeys.length > 0 && Object.keys(formData).some(key => disallowedKeys.includes(key as keyof EmployeeFormData))) {
             console.warn(`[Action updateEmployee] Employee ${currentUserIdPerformingAction} attempted to update disallowed fields: ${disallowedKeys.join(', ')} on employee PK ${id}.`);
             if (Object.keys(allowedUpdates).length === 0 && Object.keys(formData).length > 0) {
                return { success: false, errors: [{ code: 'custom', path: ['root'], message: `You are not allowed to update fields: ${disallowedKeys.join(', ')}.` }] };
             }
        }
        dataForValidation = allowedUpdates; // Only allowed fields for employee role
        if (Object.keys(dataForValidation).length === 0 && Object.keys(formData).length > 0) {
             console.log(`[Action updateEmployee] Employee ${currentUserIdPerformingAction} submitted only disallowed changes for employee PK ${id}.`);
             return { success: false, errors: [{ code: 'custom', path: ['root'], message: 'No updatable fields provided or you are not allowed to update the submitted fields.' }] };
        }
         if (Object.keys(dataForValidation).length === 0 && Object.keys(formData).length === 0) {
            console.log(`[Action updateEmployee] No data submitted for update by employee ${currentUserIdPerformingAction}.`);
            return { success: true, employee: employeeToUpdate, errors: [{ code: 'custom', path: ['root'], message: 'No changes submitted.' }] };
        }
    } else if (formData.role && userRolePerformingAction === 'Admin') { // Only Admin can change role
         dataForValidation.role = formData.role;
    } else if (formData.role && userRolePerformingAction !== 'Admin') {
        console.warn(`[Action updateEmployee] Non-Admin role ${userRolePerformingAction} attempting to change user role. Ignoring role change.`);
        delete dataForValidation.role; // Prevent non-admins from changing roles
    }


   console.log(`[Action updateEmployee] Attempting to update employee PK ${id} for tenant: ${tenantId} with data:`, dataForValidation);
   // Use a partial version of actionEmployeeSchema for updates
   const schemaForUpdate = actionEmployeeSchema.partial();
   const validation = schemaForUpdate.safeParse(dataForValidation);


  if (!validation.success) {
     console.error("[Action updateEmployee] Zod Validation Errors:", validation.error.flatten());
    return { success: false, errors: validation.error.errors };
  }
   console.log("[Action updateEmployee] Zod Validation successful. Validated data for DB:", JSON.stringify(validation.data, null, 2));

  const finalDataToUpdate = {
    ...validation.data,
    reportingManagerId: validation.data.reportingManagerId === "" ? null : validation.data.reportingManagerId,
  };


  try {
    console.log("[Action updateEmployee] Calling dbUpdateEmployee...");
    // Pass role separately if it needs to be updated on the users table
    const { role: roleToUpdate, ...employeeUpdatesForDb } = finalDataToUpdate;

    const updatedEmployee = await dbUpdateEmployee(id, tenantId, {
        ...employeeUpdatesForDb,
        role: (userRolePerformingAction === 'Admin' && roleToUpdate) ? roleToUpdate : undefined, // Only pass role if admin is updating
    });

    if (updatedEmployee) {
       console.log(`[Action updateEmployee] Employee PK ${id} updated successfully. Revalidating paths...`);
        revalidatePath(`/${tenantDomain}/employees`);
        revalidatePath(`/${tenantDomain}/employees/${updatedEmployee.id}`); // Use PK from returned object
        revalidatePath(`/${tenantDomain}/employees/${updatedEmployee.id}/edit`);
        revalidatePath(`/${tenantDomain}/dashboard`);
      return { success: true, employee: updatedEmployee };
    } else {
       console.warn(`[Action updateEmployee] Employee PK ${id} not found for tenant ${tenantId} during update.`);
      return { success: false, errors: [{ code: 'custom', path: ['id'], message: 'Employee not found for this tenant' }] };
    }
  } catch (error: any) {
    console.error(`[Action updateEmployee] Error calling dbUpdateEmployee for PK ${id}:`, error.message, error.stack ? error.stack : '(No stack trace)');
    let errorMessage = "Failed to update employee.";
    let errorPath: (string|number)[] = ['root'];
    if (error.message) {
        const prefix = "Error: ";
        errorMessage = error.message.startsWith(prefix) ? error.message.substring(prefix.length) : error.message;
         if (error.message.includes('Email address already exists')) errorPath = ['email'];
         else if (error.message.toLowerCase().includes('invalid manager id format')) errorPath = ['reportingManagerId'];
    }
    if (error.code && typeof error.code === 'string') {
        errorMessage = `Database error (code ${error.code}). ${errorMessage}`;
    }
     return { success: false, errors: [{ code: 'custom', path: errorPath, message: errorMessage }] };
  }
}

export async function deleteEmployeeAction(id: string): Promise<{ success: boolean; error?: string }> {
   let sessionData: SessionData | null;
   try {
       sessionData = await getSessionData();
       if (!sessionData?.tenantId || !sessionData?.userRole || !sessionData?.tenantDomain) {
            console.error("[Action deleteEmployeeAction] Incomplete session data:", sessionData);
           throw new Error("Incomplete session data.");
       }
   } catch (e: any) {
        console.error("[Action deleteEmployeeAction] Error fetching session data:", e.message);
        return { success: false, error: 'Failed to verify session: ' + e.message };
   }

   const { tenantId, userRole, tenantDomain } = sessionData;

   if (userRole !== 'Admin' && userRole !== 'Manager') {
       console.warn(`[Action deleteEmployeeAction] Unauthorized attempt to delete employee PK ${id} for tenant ${tenantId}`);
       return { success: false, error: 'Unauthorized to delete employees.' };
   }

   console.log(`[Action deleteEmployeeAction] Attempting to delete employee PK ${id} for tenant: ${tenantId}`);

  try {
    const deleted = await dbDeleteEmployee(id, tenantId);
    if (deleted) {
       console.log(`[Action deleteEmployeeAction] Employee PK ${id} (and associated user if any) deleted successfully. Revalidating paths...`);
        revalidatePath(`/${tenantDomain}/employees`);
        revalidatePath(`/${tenantDomain}/dashboard`);
      return { success: true };
    } else {
       console.warn(`[Action deleteEmployeeAction] Employee PK ${id} not found for tenant ${tenantId} during deletion.`);
      return { success: false, error: 'Employee not found for this tenant.' };
    }
  } catch (error: any) {
    console.error(`[Action deleteEmployeeAction] Error calling dbDeleteEmployee for PK ${id}:`, error.message, error.stack ? error.stack : '(No stack trace)');
    let errorMessage = "Failed to delete employee.";
    if (error.message) {
        const prefix = "Error: ";
        errorMessage = error.message.startsWith(prefix) ? error.message.substring(prefix.length) : error.message;
    }
    if (error.code && typeof error.code === 'string') {
        errorMessage = `Database error (code ${error.code}). ${errorMessage}`;
    }
    return { success: false, error: errorMessage };
  }
}
