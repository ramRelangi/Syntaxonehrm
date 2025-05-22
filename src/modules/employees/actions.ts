'use server';

import type { Employee, EmployeeFormData } from '@/modules/employees/types';
import { employeeSchema } from '@/modules/employees/types';
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
    getTenantIdFromSession,
    isAdminFromSession,
    getUserIdFromSession,
    getUserRoleFromSession,
    getEmployeeProfileForCurrentUser,
} from '@/modules/auth/actions';
import { userRoleSchema } from '@/modules/auth/types'; // Added import
import { addUser as dbAddUser } from '@/modules/auth/lib/db';
import { generateTemporaryPassword } from '@/modules/auth/lib/utils';
import bcrypt from 'bcrypt';
import type { SessionData, UserRole } from '@/modules/auth/types';

const SALT_ROUNDS = 10;

// Action schema expects reportingManagerId to be null or UUID string from the form,
// which is already handled by the form logic setting it to null if "None" is selected.
const actionEmployeeSchema = employeeSchema.omit({ tenantId: true, userId: true, employeeId: true }).extend({
    reportingManagerId: z.string().uuid("Invalid manager ID format.").nullable().optional(),
    role: userRoleSchema.default('Employee'), // Role is part of form data for creation by admin
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

    try {
        let employeeProfile: Employee | undefined;

        if (userRole === 'Employee') {
            console.log(`[Action getEmployeeByIdAction] Employee role. ID from URL: ${id}. Current user ID: ${currentUserId}`);
            if (id.toLowerCase() !== currentUserId.toLowerCase()) {
                console.warn(`[Action getEmployeeByIdAction] Auth_Failed (Employee Role): Attempt to access profile for ID ${id} which does not match session userId ${currentUserId}. Checking if PK ${id} belongs to current user...`);
                // Fetch by employee.id (PK)
                const potentialProfile = await dbGetEmployeeById(id.toLowerCase(), tenantId);
                if (potentialProfile && potentialProfile.userId?.toLowerCase() === currentUserId.toLowerCase()) {
                    employeeProfile = potentialProfile;
                    console.log(`[Action getEmployeeByIdAction] Employee role. Fetched employee PK ${id} and verified it belongs to session user ${currentUserId}. Name: ${employeeProfile.name}`);
                } else if (potentialProfile) {
                    console.warn(`[Action getEmployeeByIdAction] Auth_Failed (Employee Role): Attempt to access profile for Employee PK ${id}. Record's linked user_id (${potentialProfile.userId}) != session userId (${currentUserId}).`);
                    throw new Error("Unauthorized: You can only view your own employee profile.");
                } else {
                     console.warn(`[Action getEmployeeByIdAction] Employee PK ${id} not found for tenant ${tenantId}.`);
                      throw new Error("Employee profile not found.");
                }
            } else {
                // ID from URL IS the user_id, fetch by user_id
                console.log(`[Action getEmployeeByIdAction] Employee role. ID matches session. Fetching own profile using dbGetEmployeeByUserId with userId: ${id.toLowerCase()}, tenantId: ${tenantId}`);
                employeeProfile = await dbGetEmployeeByUserId(id.toLowerCase(), tenantId);
                if (employeeProfile) {
                     console.log(`[Action getEmployeeByIdAction] dbGetEmployeeByUserId SUCCESS for own profile. Fetched Employee PK: ${employeeProfile.id}, Name: ${employeeProfile.name}`);
                } else {
                    console.warn(`[Action getEmployeeByIdAction] dbGetEmployeeByUserId FAILED to find profile for current user. userId: ${id.toLowerCase()}, tenantId: ${tenantId}. This user may not have a linked employee record or tenantId mismatch.`);
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
            console.log(`[Action getEmployeeByIdAction] Final check: No employee profile found for id ${id} in tenant ${tenantId} with role ${userRole}.`);
            throw new Error("Employee not found.");
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


export async function addEmployee(formData: EmployeeFormData): Promise<{ success: boolean; employee?: Employee; errors?: z.ZodIssue[] | { code: string; path: (string|number)[]; message: string }[] }> {
   console.log("[Action addEmployee] Received formData:", JSON.stringify(formData, null, 2));
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

   const dataForValidation = {
       ...formData,
       reportingManagerId: formData.reportingManagerId || null,
       role: formData.role || 'Employee',
   };
   console.log("[Action addEmployee] Data for Zod validation:", JSON.stringify(dataForValidation, null, 2));

   const validation = actionEmployeeSchema.safeParse(dataForValidation);

  if (!validation.success) {
    console.error("[Action addEmployee] Zod Validation Errors:", validation.error.flatten());
    return { success: false, errors: validation.error.errors };
  }
  console.log("[Action addEmployee] Zod Validation successful. Validated data:", JSON.stringify(validation.data, null, 2));


  const { name, email, role: employeeRoleToSet, ...employeeDetailsValidated } = validation.data;

  let actualRoleToSet: UserRole = employeeRoleToSet || 'Employee';
  if (userRolePerformingAction === 'Manager' && actualRoleToSet !== 'Employee') {
      console.warn(`[Action addEmployee] Manager attempting to set role to ${actualRoleToSet}. Forcing to 'Employee'.`);
      actualRoleToSet = 'Employee';
  }


  const finalEmployeeData = {
    ...employeeDetailsValidated,
    reportingManagerId: employeeDetailsValidated.reportingManagerId === "" || employeeDetailsValidated.reportingManagerId === "__NO_MANAGER__" ? null : employeeDetailsValidated.reportingManagerId,
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
            role: actualRoleToSet,
            isActive: true,
        });
    } catch (userError: any) {
        console.error("[Action addEmployee] Error creating user in users table:", userError);
        return { success: false, errors: [{ code: 'custom', path: ['email'], message: userError.message || 'Failed to create user account for employee.' }] };
    }
    console.log(`[Action addEmployee] User account created with ID: ${newUser.id} and Role: ${actualRoleToSet}`);

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
            newUser.id,
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

   let dataForValidation: Partial<EmployeeFormData> = { ...formData };
    if (userRolePerformingAction === 'Employee') {
        if (employeeToUpdate.userId?.toLowerCase() !== currentUserIdPerformingAction.toLowerCase()) {
            console.warn(`[Action updateEmployee] Auth_Failed (Employee Role): Attempt to update employee PK ${id}. Record's user_id (${employeeToUpdate.userId}) != session userId (${currentUserIdPerformingAction}).`);
            return { success: false, errors: [{ code: 'custom', path: ['root'], message: 'Unauthorized to update this employee profile.' }] };
        }
        const allowedUpdates: Partial<EmployeeFormData> = {};
        if (formData.phone !== undefined) allowedUpdates.phone = formData.phone;
        if (formData.dateOfBirth !== undefined) allowedUpdates.dateOfBirth = formData.dateOfBirth;
        if (formData.gender !== undefined) allowedUpdates.gender = formData.gender;

        const disallowedKeys = Object.keys(formData).filter(key => !['phone', 'dateOfBirth', 'gender'].includes(key));
        if (disallowedKeys.length > 0 && Object.keys(formData).some(key => disallowedKeys.includes(key as keyof EmployeeFormData))) {
             console.warn(`[Action updateEmployee] Employee ${currentUserIdPerformingAction} attempted to update disallowed fields: ${disallowedKeys.join(', ')} on employee PK ${id}.`);
             if (Object.keys(allowedUpdates).length === 0 && Object.keys(formData).length > 0) {
                return { success: false, errors: [{ code: 'custom', path: ['root'], message: `You are not allowed to update fields: ${disallowedKeys.join(', ')}.` }] };
             }
        }
        dataForValidation = allowedUpdates;
        if (Object.keys(dataForValidation).length === 0 && Object.keys(formData).length > 0) {
             console.log(`[Action updateEmployee] Employee ${currentUserIdPerformingAction} submitted only disallowed changes for employee PK ${id}.`);
             return { success: false, errors: [{ code: 'custom', path: ['root'], message: 'No updatable fields provided or you are not allowed to update the submitted fields.' }] };
        }
         if (Object.keys(dataForValidation).length === 0 && Object.keys(formData).length === 0) {
            console.log(`[Action updateEmployee] No data submitted for update by employee ${currentUserIdPerformingAction}.`);
            return { success: true, employee: employeeToUpdate, errors: [{ code: 'custom', path: ['root'], message: 'No changes submitted.' }] };
        }
    } else if (formData.role) {
         dataForValidation.role = formData.role;
    }


   console.log(`[Action updateEmployee] Attempting to update employee PK ${id} for tenant: ${tenantId} with data:`, dataForValidation);
   const schemaForUpdate = actionEmployeeSchema.partial();
   const validation = schemaForUpdate.safeParse(dataForValidation);


  if (!validation.success) {
     console.error("[Action updateEmployee] Zod Validation Errors:", validation.error.flatten());
    return { success: false, errors: validation.error.errors };
  }
   console.log("[Action updateEmployee] Zod Validation successful. Validated data for DB:", JSON.stringify(validation.data, null, 2));

  const finalDataToUpdate = {
    ...validation.data,
    reportingManagerId: validation.data.reportingManagerId === "" || validation.data.reportingManagerId === "__NO_MANAGER__" ? null : validation.data.reportingManagerId,
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
