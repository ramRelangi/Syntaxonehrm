
'use server';

import type { Employee, EmployeeFormData, EmployeeStatus } from '@/modules/employees/types';
import { employeeSchema, userRoleSchema } from '@/modules/employees/types';
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
import pool from '@/lib/db'; // For linking user to employee in addEmployee action

const SALT_ROUNDS = 10;

// Schema for validating form data for add/update actions
// It omits server-generated IDs but includes fields that are now directly on employees table
// This should align with EmployeeFormData
const actionEmployeeSchema = employeeSchema.omit({ 
    id: true, tenantId: true, userId: true, employeeId: true, 
    name: true, created_at: true, updated_at: true, is_active: true 
}).extend({
    // role is part of form data for creation by admin, but also needs to be passed for user creation
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
            // For "My Profile" link, idToQuery is user_id. For "Edit My Profile", idToQuery is employee.id (PK)
            if (idToQuery === currentUserIdLower) { // This is "My Profile" view, ID in URL is user_id
                console.log(`[Action getEmployeeByIdAction] Employee role. ID from URL matches session userId. Fetching own profile using dbGetEmployeeByUserId with userId: ${idToQuery}, tenantId: ${tenantIdToQuery}`);
                employeeProfile = await dbGetEmployeeByUserId(idToQuery, tenantIdToQuery);
                if (employeeProfile) {
                     console.log(`[Action getEmployeeByIdAction] dbGetEmployeeByUserId SUCCESS for own profile. Fetched Employee PK: ${employeeProfile.id}, Name: ${employeeProfile.name}`);
                } else {
                    console.warn(`[Action getEmployeeByIdAction] dbGetEmployeeByUserId FAILED to find profile for current user. userId: ${idToQuery}, tenantId: ${tenantIdToQuery}. This user may not have a linked employee record or tenantId mismatch.`);
                }
            } else { // This is likely an "Edit My Profile" link, or an attempt to access someone else. ID in URL is employee.id (PK).
                console.log(`[Action getEmployeeByIdAction] Employee role. ID from URL (${idToQuery}) does not match session userId (${currentUserIdLower}). Assuming ID is employee.id (PK). Fetching by PK to verify ownership.`);
                employeeProfile = await dbGetEmployeeById(idToQuery, tenantIdToQuery);
                 if (employeeProfile) {
                    console.log(`[Action getEmployeeByIdAction] Fetched employee by PK ${idToQuery}. Record details: ID=${employeeProfile.id}, Linked_UserID_On_Record=${employeeProfile.userId}, Name=${employeeProfile.name}`);
                    if (employeeProfile.userId?.toLowerCase() !== currentUserIdLower) {
                        console.warn(`[Action getEmployeeByIdAction] Auth_Failed (Employee Role): Attempt to access/edit profile for Employee PK ${idToQuery}. Record's linked user_id (${employeeProfile.userId}) does NOT match session userId (${currentUserIdLower}).`);
                        throw new Error("Unauthorized: You can only view/edit your own employee profile.");
                    }
                    console.log(`[Action getEmployeeByIdAction] Auth_Success (Employee Role): Employee PK ${idToQuery} belongs to session user ${currentUserIdLower}.`);
                } else {
                    console.warn(`[Action getEmployeeByIdAction] Auth_Failed (Employee Role): Employee PK ${idToQuery} not found for tenant ${tenantIdToQuery}. Cannot verify ownership.`);
                    throw new Error("Employee profile not found or you are not authorized.");
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
       console.error("[Action addEmployee] Error stack:", e.stack);
       return { success: false, errors: [{ code: 'custom', path: ['root'], message: 'Failed to verify session: ' + e.message }] };
   }

   const { tenantId, userRole: userRolePerformingAction, tenantDomain } = sessionData;

   if (userRolePerformingAction !== 'Admin' && userRolePerformingAction !== 'Manager') {
        console.warn(`[Action addEmployee] Unauthorized attempt to add employee for tenant ${tenantId}. User role: ${userRolePerformingAction}`);
        return { success: false, errors: [{ code: 'custom', path: ['root'], message: 'Unauthorized to add employees.' }] };
   }
   console.log(`[Action addEmployee] Attempting to add employee for tenant: ${tenantId}`);

    const dataForValidation = {
        ...formData,
        reportingManagerId: formData.reportingManagerId || null,
        role: formData.role || 'Employee', // Role for the User account
        status: formData.status || 'Active',
        employmentType: formData.employmentType || 'Full-time',
    };
   console.log("[Action addEmployee] Data for Zod validation:", JSON.stringify(dataForValidation, null, 2));

   // Use the schema that matches EmployeeFormData (omits server-generated fields)
   const validation = actionEmployeeSchema.safeParse(dataForValidation);

  if (!validation.success) {
    console.error("[Action addEmployee] Zod Validation Errors:", validation.error.flatten());
    return { success: false, errors: validation.error.errors };
  }
  console.log("[Action addEmployee] Zod Validation successful. Validated data:", JSON.stringify(validation.data, null, 2));

  // Destructure all relevant fields from validation.data
  const { role: employeeRoleForUser, ...employeeDetailsForm } = validation.data;

  let actualRoleToSet: UserRole = employeeRoleForUser || 'Employee';
  if (userRolePerformingAction === 'Manager' && actualRoleToSet !== 'Employee') {
      console.warn(`[Action addEmployee] Manager attempting to set role to ${actualRoleToSet}. Forcing to 'Employee'.`);
      actualRoleToSet = 'Employee';
  }
  
  const employeeDataToSave: Omit<EmployeeFormData, 'role'> & { tenantId: string, userId: string, status: EmployeeStatus } = {
    ...employeeDetailsForm, // This contains all fields from EmployeeFormData EXCEPT role
    reportingManagerId: employeeDetailsForm.reportingManagerId || null,
    tenantId: "", // Will be set
    userId: "",   // Will be set
    status: employeeDetailsForm.status || 'Active', // Ensure status is set
  };


  try {
    console.log("[Action addEmployee] Creating user and employee...");

    const temporaryPassword = generateTemporaryPassword(12);
    console.log('[Action addEmployee] Generated temporary password length:', temporaryPassword.length);
    const passwordHash = await bcrypt.hash(temporaryPassword, SALT_ROUNDS);
    
    let newUser;
    try {
        const userDataForDb = {
            tenant_id: tenantId,
            username: employeeDataToSave.email.toLowerCase(), // Use email as username
            passwordHash,
            email: employeeDataToSave.email.toLowerCase(),
            name: `${employeeDataToSave.first_name} ${employeeDataToSave.last_name || ''}`.trim(),
            role: actualRoleToSet,
            is_active: true,
            employee_id: undefined, 
        };
        console.log("[Action addEmployee] Data being passed to dbAddUser:", JSON.stringify(userDataForDb));
        newUser = await dbAddUser(userDataForDb);
    } catch (userError: any) {
        console.error("[Action addEmployee] Error creating user in users table:", userError);
        return { success: false, errors: [{ code: 'custom', path: ['email'], message: userError.message || 'Failed to create user account for employee.' }] };
    }
    console.log(`[Action addEmployee] User account created with ID: ${newUser.user_id} and Role: ${actualRoleToSet}`);

    employeeDataToSave.tenantId = tenantId;
    employeeDataToSave.userId = newUser.user_id;

    // Pass only the fields relevant to EmployeeFormData for dbAddEmployeeInternal
    const newEmployee = await dbAddEmployeeInternal(employeeDataToSave);
    console.log(`[Action addEmployee] Employee record added successfully (ID: ${newEmployee.id}, EmployeeID: ${newEmployee.employeeId}).`);

    // Link user to employee by updating users.employee_id with newEmployee.id (PK of employees table)
    const client = await pool.connect();
    try {
        await client.query('UPDATE users SET employee_id = $1 WHERE user_id = $2 AND tenant_id = $3', 
        [newEmployee.id, newUser.user_id, tenantId]);
        console.log(`[Action addEmployee] Linked user ${newUser.user_id} to employee ${newEmployee.id}.`);
    } catch (linkError) {
        console.error(`[Action addEmployee] CRITICAL: Failed to link user ${newUser.user_id} to employee ${newEmployee.id}:`, linkError);
    } finally {
        client.release();
    }

    try {
        console.log(`[Action addEmployee] Attempting to queue welcome email for ${newEmployee.email} to ${tenantDomain}...`);
        const emailSent = await sendEmployeeWelcomeEmail(
            tenantId,
            newEmployee.name,
            newEmployee.email,
            newUser.user_id, // Pass user's UUID
            newEmployee.employeeId!, // Pass official employee_id (EMP-XXX)
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
        if (error.message.includes('email address already exists')) errorPath = ['email'];
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

    const employeeToUpdate = await dbGetEmployeeById(id.toLowerCase(), tenantId); 
    if (!employeeToUpdate) {
        console.warn(`[Action updateEmployee] Employee PK ${id} not found for tenant ${tenantId}.`);
        return { success: false, errors: [{ code: 'custom', path: ['id'], message: 'Employee not found.' }] };
    }

   let dataForValidation: Partial<EmployeeFormData> & { role?: UserRole } = { ...formData };

    if (userRolePerformingAction === 'Employee') {
        if (employeeToUpdate.userId?.toLowerCase() !== currentUserIdPerformingAction.toLowerCase()) {
            console.warn(`[Action updateEmployee] Auth_Failed (Employee Role): Attempt to update employee PK ${id}. Record's user_id (${employeeToUpdate.userId}) != session userId (${currentUserIdPerformingAction}).`);
            return { success: false, errors: [{ code: 'custom', path: ['root'], message: 'Unauthorized to update this employee profile.' }] };
        }
        // Define allowed fields for 'Employee' role to update
        const allowedFields: (keyof EmployeeFormData)[] = [
            'personal_email', 'phone', 'dateOfBirth', 'marital_status', 
            'nationality', 'blood_group', 'emergency_contact_name', 
            'emergency_contact_number' 
            // Add other purely personal fields if necessary
        ];
        
        const updatesToApply: Partial<EmployeeFormData> = {};
        let hasAllowedUpdates = false;
        const attemptedDisallowedUpdates: string[] = [];

        for (const key in formData) {
            if (Object.prototype.hasOwnProperty.call(formData, key)) {
                if (allowedFields.includes(key as keyof EmployeeFormData)) {
                    (updatesToApply as any)[key] = (formData as any)[key];
                    hasAllowedUpdates = true;
                } else if (key !== 'role') { // Role is handled separately, don's list as disallowed
                    attemptedDisallowedUpdates.push(key);
                }
            }
        }

        if (attemptedDisallowedUpdates.length > 0 && !hasAllowedUpdates) {
             console.warn(`[Action updateEmployee] Employee ${currentUserIdPerformingAction} attempted to update only disallowed fields: ${attemptedDisallowedUpdates.join(', ')} on employee PK ${id}.`);
             return { success: false, errors: [{ code: 'custom', path: ['root'], message: `You are not allowed to update fields: ${attemptedDisallowedUpdates.join(', ')}.` }] };
        }
        if (!hasAllowedUpdates && Object.keys(formData).length > 0 && !formData.role) { // Check if any form data was sent but no allowed fields
             console.log(`[Action updateEmployee] Employee ${currentUserIdPerformingAction} submitted only disallowed changes or no relevant changes for employee PK ${id}.`);
             return { success: false, errors: [{ code: 'custom', path: ['root'], message: 'No updatable fields provided or you are not allowed to update the submitted fields.' }] };
        }
         if (!hasAllowedUpdates && Object.keys(formData).length === 0) { // No data submitted at all
            console.log(`[Action updateEmployee] No data submitted for update by employee ${currentUserIdPerformingAction}.`);
            return { success: true, employee: employeeToUpdate }; // Return current data
        }
        dataForValidation = updatesToApply; // Only use allowed updates for validation
        if (formData.role) { // If role was somehow sent, remove it for 'Employee'
            delete (dataForValidation as any).role;
        }

    } else if (formData.role && userRolePerformingAction === 'Admin') { 
         dataForValidation.role = formData.role;
    } else if (formData.role && userRolePerformingAction !== 'Admin') {
        console.warn(`[Action updateEmployee] Non-Admin role ${userRolePerformingAction} attempting to change user role. Ignoring role change.`);
        delete dataForValidation.role; 
    }


   const schemaForUpdate = actionEmployeeSchema.partial();
   const validation = schemaForUpdate.safeParse(dataForValidation);


  if (!validation.success) {
     console.error("[Action updateEmployee] Zod Validation Errors:", validation.error.flatten());
    return { success: false, errors: validation.error.errors };
  }
   console.log("[Action updateEmployee] Zod Validation successful. Validated data for DB:", JSON.stringify(validation.data, null, 2));

  const finalDataToUpdate = {
    ...validation.data,
    reportingManagerId: validation.data.reportingManagerId === "" ? null : (validation.data.reportingManagerId || null),
  };

  try {
    console.log("[Action updateEmployee] Calling dbUpdateEmployee...");
    const { role: roleToUpdate, ...employeeUpdatesForDb } = finalDataToUpdate;

    const updatedEmployee = await dbUpdateEmployee(id, tenantId, {
        ...employeeUpdatesForDb, // This is Omit<EmployeeFormData, 'role'>
        role: (userRolePerformingAction === 'Admin' && roleToUpdate) ? roleToUpdate : undefined,
    });

    if (updatedEmployee) {
       console.log(`[Action updateEmployee] Employee PK ${id} updated successfully. Revalidating paths...`);
        revalidatePath(`/${tenantDomain}/employees`);
        revalidatePath(`/${tenantDomain}/employees/${updatedEmployee.id}`); 
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
