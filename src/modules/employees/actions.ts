
'use server';

import type { Employee, EmployeeFormData } from '@/modules/employees/types';
import { employeeSchema } from '@/modules/employees/types';
import {
  getAllEmployees as dbGetAllEmployees,
  getEmployeeById as dbGetEmployeeById,
  addEmployee as dbAddEmployeeInternal,
  updateEmployee as dbUpdateEmployee,
  deleteEmployee as dbDeleteEmployee,
  getEmployeeByUserId as dbGetEmployeeByUserId,
} from '@/modules/employees/lib/db';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import {
    getSessionData, // Use the general session data fetcher
    sendEmployeeWelcomeEmail,
    // Ensure these specific helpers are also available if used directly elsewhere, though getSessionData is preferred
    getTenantIdFromSession,
    isAdminFromSession,
    getUserIdFromSession,
    getUserRoleFromSession,
    getEmployeeProfileForCurrentUser,
    _parseSessionCookie,
} from '@/modules/auth/actions';
import { addUser as dbAddUser } from '@/modules/auth/lib/db';
import { generateTemporaryPassword } from '@/modules/auth/lib/utils';
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

// Schema for actions - expects reportingManagerId to be null or UUID string
const actionEmployeeSchema = employeeSchema.omit({ tenantId: true, userId: true, employeeId: true }).extend({
    reportingManagerId: z.string().uuid("Invalid manager ID format").nullable().optional(),
});


export async function getEmployees(): Promise<Employee[]> {
  console.log("[Action getEmployees] Initiating fetch.");
  let sessionData: Awaited<ReturnType<typeof getSessionData>>;
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
    let sessionData: Awaited<ReturnType<typeof getSessionData>>;
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

    try {
        let employeeProfile: Employee | undefined;

        if (userRole === 'Employee') {
            console.log(`[Action getEmployeeByIdAction] Employee role. ID from URL: ${id}. Current user ID: ${currentUserId}`);
            // For "My Profile", ID from URL is the user_id. For "Edit Profile", ID from URL is employee.id
            // This action is generally called with employee.id for fetching.
            // We need to ensure the employee record fetched by employee.id belongs to the current user.
            const potentialProfile = await dbGetEmployeeById(id.toLowerCase(), tenantId);
            if (potentialProfile && potentialProfile.userId?.toLowerCase() === currentUserId.toLowerCase()) {
                employeeProfile = potentialProfile;
                console.log(`[Action getEmployeeByIdAction] Employee role. Fetched employee PK ${id} and verified it belongs to session user ${currentUserId}.`);
            } else if (potentialProfile) { // Found employee but doesn't belong to current user
                console.warn(`[Action getEmployeeByIdAction] Auth_Failed (Employee Role): Attempt to access profile for Employee PK ${id}. Record's user_id (${potentialProfile.userId}) != session userId (${currentUserId}).`);
                throw new Error("Unauthorized: You can only view your own employee profile.");
            } else { // Employee not found by PK
                 console.warn(`[Action getEmployeeByIdAction] Employee PK ${id} not found for tenant ${tenantId}.`);
                 // If the ID from URL *might* be a userId (e.g. direct "My Profile" link concept)
                 if (id.toLowerCase() === currentUserId.toLowerCase()) {
                    console.log(`[Action getEmployeeByIdAction] ID matches session. Attempting fetch by userId as fallback for Employee role.`);
                    employeeProfile = await dbGetEmployeeByUserId(id.toLowerCase(), tenantId);
                    if (!employeeProfile) {
                        console.warn(`[Action getEmployeeByIdAction] Also failed to find profile by userId ${id}.`);
                    }
                 }
            }
        } else { // Admin or Manager
            console.log(`[Action getEmployeeByIdAction] Admin/Manager role. Fetching employee by primary key (employee.id): ${id.toLowerCase()} for tenant: ${tenantId}`);
            employeeProfile = await dbGetEmployeeById(id.toLowerCase(), tenantId);
            if (employeeProfile) {
                console.log(`[Action getEmployeeByIdAction] dbGetEmployeeById SUCCESS: Found employee ${employeeProfile.id} (PK). Name: ${employeeProfile.name}`);
            } else {
                console.warn(`[Action getEmployeeByIdAction] dbGetEmployeeById FAILED: Employee profile NOT found for employee.id (PK) ${id} in tenant ${tenantId}.`);
            }
        }

        if (!employeeProfile) {
            console.log(`[Action getEmployeeByIdAction] No employee profile found for id ${id} in tenant ${tenantId} with role ${userRole}.`);
        }
        return employeeProfile;

    } catch (error: any) {
        console.error(`[Action getEmployeeByIdAction] Error processing request for employee ID ${id} (tenant: ${tenantId}):`, error);
        if (error.message?.toLowerCase().includes('unauthorized')) {
            throw error;
        }
        let friendlyMessage = `Failed to fetch employee details.`;
        if (error.code && typeof error.code === 'string') {
            friendlyMessage = `Database error (code ${error.code}) retrieving employee.`;
        } else if (error.message) {
            const prefix = "Error: ";
            friendlyMessage = error.message.startsWith(prefix) ? error.message.substring(prefix.length) : error.message;
        }
        throw new Error(friendlyMessage);
    }
}


export async function addEmployee(formData: Omit<EmployeeFormData, 'tenantId' | 'userId' | 'employeeId'>): Promise<{ success: boolean; employee?: Employee; errors?: z.ZodIssue[] | { code: string; path: (string|number)[]; message: string }[] }> {
   console.log("[Action addEmployee] Received formData:", JSON.stringify(formData, null, 2));
   let sessionData;
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

   const { tenantId, userRole, tenantDomain } = sessionData;

   if (userRole !== 'Admin' && userRole !== 'Manager') {
        console.warn(`[Action addEmployee] Unauthorized attempt to add employee for tenant ${tenantId}. User role: ${userRole}`);
        return { success: false, errors: [{ code: 'custom', path: ['root'], message: 'Unauthorized to add employees.' }] };
   }

   console.log(`[Action addEmployee] Attempting to add employee for tenant: ${tenantId}`);

   // Data for Zod validation, ensuring reportingManagerId is null if not a valid UUID
   const dataForValidation = {
       ...formData,
       reportingManagerId: formData.reportingManagerId ? formData.reportingManagerId : null,
   };
   console.log("[Action addEmployee] Data for Zod validation:", JSON.stringify(dataForValidation, null, 2));

   const validation = actionEmployeeSchema.safeParse(dataForValidation);

  if (!validation.success) {
    console.error("[Action addEmployee] Zod Validation Errors:", validation.error.flatten());
    return { success: false, errors: validation.error.errors };
  }
  console.log("[Action addEmployee] Zod Validation successful. Validated data:", JSON.stringify(validation.data, null, 2));


  const { name, email, ...employeeDetailsValidated } = validation.data;
  // Ensure reportingManagerId is null if it was an empty string or the special value after validation
  const finalEmployeeData = {
    ...employeeDetailsValidated,
    reportingManagerId: employeeDetailsValidated.reportingManagerId, // Should be null or UUID string from validation
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
            passwordHash,
            name,
            role: 'Employee',
            isActive: true,
        });
    } catch (userError: any) {
        console.error("[Action addEmployee] Error creating user in users table:", userError);
        return { success: false, errors: [{ code: 'custom', path: ['email'], message: userError.message || 'Failed to create user account for employee.' }] };
    }
    console.log(`[Action addEmployee] User account created with ID: ${newUser.id}`);

    const newEmployee = await dbAddEmployeeInternal({
        ...finalEmployeeData,
        tenantId,
        userId: newUser.id,
        name,
        email,
    });
    console.log(`[Action addEmployee] Employee record added successfully (ID: ${newEmployee.id}, EmployeeID: ${newEmployee.employeeId}).`);

    try {
        console.log(`[Action addEmployee] Attempting to queue welcome email for ${newEmployee.email} to ${tenantDomain}...`);
        const emailSent = await sendEmployeeWelcomeEmail(
            tenantId,
            newEmployee.name,
            newEmployee.email,
            newEmployee.id,
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

export async function updateEmployee(id: string, formData: Partial<Omit<EmployeeFormData, 'tenantId' | 'userId' | 'employeeId'>>): Promise<{ success: boolean; employee?: Employee; errors?: z.ZodIssue[] | { code: string; path: (string|number)[]; message: string }[] }> {
   console.log(`[Action updateEmployee] Received formData for ID ${id}:`, JSON.stringify(formData, null, 2));
   let sessionData;
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

   const dataForValidation = {
       ...formData,
       reportingManagerId: formData.reportingManagerId ? formData.reportingManagerId : null,
   };
   console.log("[Action updateEmployee] Data for Zod validation:", JSON.stringify(dataForValidation, null, 2));

    let validatedDataForAction: Partial<EmployeeFormData>;

    if (userRolePerformingAction === 'Employee') {
        const employeeToUpdate = await dbGetEmployeeById(id.toLowerCase(), tenantId);
        if (!employeeToUpdate || employeeToUpdate.userId?.toLowerCase() !== currentUserIdPerformingAction.toLowerCase()) {
            console.warn(`[Action updateEmployee] Unauthorized attempt by employee ${currentUserIdPerformingAction} to update employee PK ${id}`);
            return { success: false, errors: [{ code: 'custom', path: ['root'], message: 'Unauthorized to update this employee profile.' }] };
        }
        const allowedUpdates: Partial<EmployeeFormData> = {};
        if (dataForValidation.phone !== undefined) allowedUpdates.phone = dataForValidation.phone;
        if (dataForValidation.dateOfBirth !== undefined) allowedUpdates.dateOfBirth = dataForValidation.dateOfBirth;
        if (dataForValidation.gender !== undefined) allowedUpdates.gender = dataForValidation.gender;

        const disallowedKeys = Object.keys(dataForValidation).filter(key => !['phone', 'dateOfBirth', 'gender'].includes(key));
        if (disallowedKeys.length > 0 && Object.keys(dataForValidation).some(key => disallowedKeys.includes(key))) {
             console.warn(`[Action updateEmployee] Employee ${currentUserIdPerformingAction} attempted to update disallowed fields: ${disallowedKeys.join(', ')} on employee PK ${id}.`);
             if (Object.keys(allowedUpdates).length === 0) {
                return { success: false, errors: [{ code: 'custom', path: ['root'], message: `You are not allowed to update fields: ${disallowedKeys.join(', ')}.` }] };
             }
        }
        validatedDataForAction = allowedUpdates;

        if (Object.keys(validatedDataForAction).length === 0) {
            console.log(`[Action updateEmployee] No valid/allowed changes submitted by employee ${currentUserIdPerformingAction} for employee PK ${id}.`);
            return { success: true, employee: employeeToUpdate, errors: [{ code: 'custom', path: ['root'], message: 'No updatable changes detected.' }] };
        }
    } else {
         validatedDataForAction = dataForValidation;
    }


   console.log(`[Action updateEmployee] Attempting to update employee PK ${id} for tenant: ${tenantId} with data:`, validatedDataForAction);
   const validation = actionEmployeeSchema.partial().safeParse(validatedDataForAction);


  if (!validation.success) {
     console.error("[Action updateEmployee] Zod Validation Errors:", validation.error.flatten());
    return { success: false, errors: validation.error.errors };
  }
   console.log("[Action updateEmployee] Zod Validation successful. Validated data for DB:", JSON.stringify(validation.data, null, 2));

  const finalDataToUpdate = {
    ...validation.data,
    reportingManagerId: validation.data.reportingManagerId, // Should be null or UUID string
  };
  

  try {
    console.log("[Action updateEmployee] Calling dbUpdateEmployee...");
    const updatedEmployee = await dbUpdateEmployee(id, tenantId, finalDataToUpdate);
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
   let sessionData;
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
