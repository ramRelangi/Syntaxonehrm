
'use server';

import type { Employee, User } from '@/modules/employees/types';
import { employeeSchema, type EmployeeFormData } from '@/modules/employees/types';
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
    getSessionData,
    sendEmployeeWelcomeEmail,
    getTenantIdFromSession,
    isAdminFromSession,
    getUserIdFromSession,
    getUserRoleFromSession,
    getEmployeeProfileForCurrentUser,
} from '@/modules/auth/actions';
import { addUser as dbAddUser } from '@/modules/auth/lib/db';
import { generateTemporaryPassword } from '@/modules/auth/lib/utils';
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

export async function getEmployees(): Promise<Employee[]> {
  console.log("[Action getEmployees] Initiating fetch.");
  let sessionData: Awaited<ReturnType<typeof getSessionData>> = null;

  try {
    console.log("[Action getEmployees] Attempting to get session data...");
    sessionData = await getSessionData();
    if (!sessionData?.tenantId) {
        console.error("[Action getEmployees] Critical: Tenant ID missing from session.");
        throw new Error("Tenant context not found.");
    }
    if (!sessionData?.userRole) {
        console.error("[Action getEmployees] Critical: UserRole missing from session.");
        throw new Error("User role not found in session.");
    }
     if (!sessionData?.userId) {
        console.error("[Action getEmployees] Critical: UserId missing from session.");
        throw new Error("User ID not found in session.");
    }
    console.log(`[Action getEmployees] Session data retrieved: tenantId=${sessionData.tenantId}, userRole=${sessionData.userRole}, userId=${sessionData.userId}`);
  } catch (e: any) {
    console.error("[Action getEmployees] Error fetching session data:", e.message, e.stack ? e.stack : '(No stack trace)');
    throw new Error("Failed to retrieve session context: " + e.message);
  }

  const { tenantId, userRole, userId } = sessionData;

  try {
    if (userRole === 'Employee') {
      console.log(`[Action getEmployees] Employee role, attempting to fetch own profile for session user: ${userId}`);
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
    console.log(`[Action getEmployeeByIdAction] Received ID param: ${id}`);
    let sessionData: Awaited<ReturnType<typeof getSessionData>> | null = null;
    try {
        sessionData = await getSessionData();
    } catch (e: any) {
        console.error(`[Action getEmployeeByIdAction] Error fetching session data for ID ${id}:`, e);
        throw new Error(`Session retrieval failed: ${e.message}`);
    }

    if (!sessionData?.tenantId || !sessionData.userRole || !sessionData.userId) {
        console.error(`[Action getEmployeeByIdAction] Incomplete session for ID ${id}: tenantId=${sessionData?.tenantId}, userRole=${sessionData?.userRole}, currentUserId=${sessionData?.userId}`);
        throw new Error("Incomplete session data.");
    }

    const { tenantId, userRole, userId: currentUserId } = sessionData;
    console.log(`[Action getEmployeeByIdAction] Session - currentUserId: ${currentUserId}, tenantId: ${tenantId}, userRole: ${userRole}`);

    try {
        if (userRole === 'Employee') {
            // 'id' from URL is the employee's own user_id for "My Profile"
            if (id.toLowerCase() !== currentUserId.toLowerCase()) {
                console.warn(`[Action getEmployeeByIdAction] Auth_Failed (Employee Role): Attempt to access profile for ID ${id} which does not match session userId ${currentUserId}.`);
                throw new Error("Unauthorized: You can only view your own employee profile.");
            }
            console.log(`[Action getEmployeeByIdAction] Employee role. Matched ID. Fetching own profile using dbGetEmployeeByUserId with userId: ${id.toLowerCase()}, tenantId: ${tenantId}`);
            const employeeProfile = await dbGetEmployeeByUserId(id.toLowerCase(), tenantId);
            if (employeeProfile) {
                console.log(`[Action getEmployeeByIdAction] dbGetEmployeeByUserId SUCCESS: Found profile for user ${id}. Employee ID (PK): ${employeeProfile.id}, Linked User ID on record: ${employeeProfile.userId}`);
            } else {
                console.warn(`[Action getEmployeeByIdAction] dbGetEmployeeByUserId FAILED: Profile NOT found by dbGetEmployeeByUserId for user ${id} in tenant ${tenantId}. This user may not have a linked employee record.`);
            }
            return employeeProfile;
        } else { // Admin or Manager
            // 'id' from URL is the employee's primary key (employee.id)
            console.log(`[Action getEmployeeByIdAction] Admin/Manager role. Fetching employee by primary key (employee.id): ${id.toLowerCase()} for tenant: ${tenantId}`);
            const employeeProfile = await dbGetEmployeeById(id.toLowerCase(), tenantId);
            if (employeeProfile) {
                console.log(`[Action getEmployeeByIdAction] dbGetEmployeeById SUCCESS: Found employee ${employeeProfile.id} (PK) with linked user_id ${employeeProfile.userId}`);
                if (employeeProfile.userId?.toLowerCase() === currentUserId.toLowerCase()) {
                    console.log(`[Action getEmployeeByIdAction] Note: Admin/Manager is viewing their own profile (matched by user_id).`);
                }
            } else {
                console.warn(`[Action getEmployeeByIdAction] dbGetEmployeeById FAILED: Employee profile NOT found for employee.id (PK) ${id} in tenant ${tenantId}.`);
            }
            return employeeProfile;
        }
    } catch (error: any) {
        console.error(`[Action getEmployeeByIdAction] Error processing request for employee ID ${id} (tenant: ${tenantId}):`, error);
        if (error.message?.toLowerCase().includes('unauthorized')) {
            throw error;
        }
        let friendlyMessage = `Failed to fetch employee details for ID ${id}.`;
        if (error.code && typeof error.code === 'string') {
            friendlyMessage = `Database error (code ${error.code}) retrieving employee. Check server logs.`;
        } else if (error.message) {
            const prefix = "Error: ";
            friendlyMessage = error.message.startsWith(prefix) ? error.message.substring(prefix.length) : error.message;
        }
        throw new Error(friendlyMessage);
    }
}

export async function addEmployee(formData: Omit<EmployeeFormData, 'tenantId' | 'userId' | 'employeeId'>): Promise<{ success: boolean; employee?: Employee; errors?: z.ZodIssue[] | { code: string; path: (string|number)[]; message: string }[] }> {
   let sessionData: Awaited<ReturnType<typeof getSessionData>> = null;

   try {
       console.log("[Action addEmployee] Attempting to get session data...");
       sessionData = await getSessionData();
       if (!sessionData?.tenantId || !sessionData?.userRolePerformingAction || !sessionData?.tenantDomain) {
           console.error("[Action addEmployee] Incomplete session data:", sessionData);
           throw new Error("Incomplete session data. TenantId, UserRole, or TenantDomain is missing.");
       }
       console.log(`[Action addEmployee] Session data retrieved: tenantId=${sessionData.tenantId}, userRole=${sessionData.userRolePerformingAction}, tenantDomain=${sessionData.tenantDomain}`);
   } catch (e: any) {
       console.error("[Action addEmployee] Error fetching session data:", e.message, e.stack ? e.stack : '(No stack trace)');
       return { success: false, errors: [{ code: 'custom', path: ['root'], message: 'Failed to verify session: ' + e.message }] };
   }

   const { tenantId, userRolePerformingAction, tenantDomain } = sessionData;

   if (userRolePerformingAction !== 'Admin' && userRolePerformingAction !== 'Manager') {
        console.warn(`[Action addEmployee] Unauthorized attempt to add employee for tenant ${tenantId}. User role: ${userRolePerformingAction}`);
        return { success: false, errors: [{ code: 'custom', path: ['root'], message: 'Unauthorized to add employees.' }] };
   }

   console.log(`[Action addEmployee] Attempting to add employee for tenant: ${tenantId}`);
   const validation = employeeSchema.omit({userId: true, employeeId: true, tenantId: true}).safeParse(formData);

  if (!validation.success) {
    console.error("[Action addEmployee] Validation Errors:", validation.error.flatten());
    return { success: false, errors: validation.error.errors };
  }

  const { name, email, ...employeeDetails } = validation.data;

  try {
    console.log("[Action addEmployee] Validation successful. Creating user and employee...");

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
            role: 'Employee', // New users created via addEmployee are always 'Employee' role
            isActive: true,
        });
    } catch (userError: any) {
        console.error("[Action addEmployee] Error creating user in users table:", userError.message, userError.stack ? userError.stack : '(No stack trace)');
        return { success: false, errors: [{ code: 'custom', path: ['email'], message: userError.message || 'Failed to create user account for employee.' }] };
    }
    console.log(`[Action addEmployee] User account created with ID: ${newUser.id}`);

    const newEmployee = await dbAddEmployeeInternal({
        ...employeeDetails,
        tenantId,
        userId: newUser.id, // Link the new user
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
            newEmployee.id, // employee.id (PK)
            newEmployee.employeeId!, // Official employee_id (EMP-XXX)
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
    }
    if (error.code && typeof error.code === 'string') {
        errorMessage = `Database error (code ${error.code}). ${errorMessage}`;
    }

     return { success: false, errors: [{ code: 'custom', path: errorPath, message: errorMessage }] };
  }
}

export async function updateEmployee(id: string, formData: Partial<Omit<EmployeeFormData, 'tenantId' | 'userId' | 'employeeId'>>): Promise<{ success: boolean; employee?: Employee; errors?: z.ZodIssue[] | { code: string; path: (string|number)[]; message: string }[] }> {
   let sessionData: Awaited<ReturnType<typeof getSessionData>> = null;
   try {
       sessionData = await getSessionData();
       if (!sessionData?.tenantId || !sessionData?.userRolePerformingAction || !sessionData?.userId || !sessionData?.tenantDomain) {
           console.error("[Action updateEmployee] Incomplete session data:", sessionData);
           throw new Error("Incomplete session data.");
       }
   } catch (e: any) {
       console.error("[Action updateEmployee] Error fetching session data:", e.message);
       return { success: false, errors: [{ code: 'custom', path: ['root'], message: 'Failed to verify session: ' + e.message }] };
   }

   const { tenantId, userRolePerformingAction, userId: currentUserIdPerformingAction, tenantDomain } = sessionData;

   let dataToUpdate = { ...formData };

    if (userRolePerformingAction === 'Employee') {
        const employeeToUpdate = await dbGetEmployeeById(id.toLowerCase(), tenantId);
        if (!employeeToUpdate || employeeToUpdate.userId !== currentUserIdPerformingAction) {
            console.warn(`[Action updateEmployee] Unauthorized attempt by employee ${currentUserIdPerformingAction} to update employee ${id}`);
            return { success: false, errors: [{ code: 'custom', path: ['root'], message: 'Unauthorized to update this employee profile.' }] };
        }
        // Employee can only update specific fields
        const allowedUpdates: Partial<EmployeeFormData> = {};
        if (formData.phone !== undefined) allowedUpdates.phone = formData.phone;
        if (formData.dateOfBirth !== undefined) allowedUpdates.dateOfBirth = formData.dateOfBirth;
        
        if (Object.keys(allowedUpdates).length === 0 && Object.keys(formData).length > 0) {
             return { success: false, errors: [{ code: 'custom', path: ['root'], message: 'You can only update your phone number and date of birth.' }] };
        }
        dataToUpdate = allowedUpdates;
         // If trying to update other fields, return error or strip them
        const disallowedKeys = Object.keys(formData).filter(key => !['phone', 'dateOfBirth'].includes(key));
        if (disallowedKeys.length > 0) {
             console.warn(`[Action updateEmployee] Employee ${currentUserIdPerformingAction} attempted to update disallowed fields: ${disallowedKeys.join(', ')}`);
             return { success: false, errors: [{ code: 'custom', path: ['root'], message: `You are not allowed to update fields: ${disallowedKeys.join(', ')}.` }] };
        }
    }

    if (Object.keys(dataToUpdate).length === 0) {
        // No actual changes to be made, return success or a message indicating no changes
        const currentEmployee = await dbGetEmployeeById(id.toLowerCase(), tenantId);
        return { success: true, employee: currentEmployee, errors: [{ code: 'custom', path: ['root'], message: 'No changes detected.' }] };
    }


   console.log(`[Action updateEmployee] Attempting to update employee ${id} for tenant: ${tenantId} with data:`, dataToUpdate);
   const validation = employeeSchema.partial().omit({ tenantId: true, userId: true, employeeId: true }).safeParse(dataToUpdate);

  if (!validation.success) {
     console.error("[Action updateEmployee] Validation Errors:", validation.error.flatten());
    return { success: false, errors: validation.error.errors };
  }

  try {
    console.log("[Action updateEmployee] Validation successful. Calling dbUpdateEmployee...");
    const updatedEmployee = await dbUpdateEmployee(id, tenantId, validation.data); // validation.data should be dataToUpdate
    if (updatedEmployee) {
       console.log(`[Action updateEmployee] Employee ${id} updated successfully. Revalidating paths...`);
        revalidatePath(`/${tenantDomain}/employees`);
        revalidatePath(`/${tenantDomain}/employees/${id}`);
        revalidatePath(`/${tenantDomain}/employees/${id}/edit`);
        revalidatePath(`/${tenantDomain}/dashboard`);
      return { success: true, employee: updatedEmployee };
    } else {
       console.warn(`[Action updateEmployee] Employee ${id} not found for tenant ${tenantId} during update.`);
      return { success: false, errors: [{ code: 'custom', path: ['id'], message: 'Employee not found for this tenant' }] };
    }
  } catch (error: any) {
    console.error(`[Action updateEmployee] Error calling dbUpdateEmployee for ${id}:`, error.message, error.stack ? error.stack : '(No stack trace)');
    let errorMessage = "Failed to update employee.";
    let errorPath: (string|number)[] = ['root'];
    if (error.message) {
        const prefix = "Error: ";
        errorMessage = error.message.startsWith(prefix) ? error.message.substring(prefix.length) : error.message;
         if (error.message.includes('Email address already exists')) errorPath = ['email'];
    }
    if (error.code && typeof error.code === 'string') {
        errorMessage = `Database error (code ${error.code}). ${errorMessage}`;
    }
     return { success: false, errors: [{ code: 'custom', path: errorPath, message: errorMessage }] };
  }
}

export async function deleteEmployeeAction(id: string): Promise<{ success: boolean; error?: string }> {
   let sessionData: Awaited<ReturnType<typeof getSessionData>> = null;
   try {
       sessionData = await getSessionData();
       if (!sessionData?.tenantId || !sessionData?.userRolePerformingAction || !sessionData?.tenantDomain) {
            console.error("[Action deleteEmployeeAction] Incomplete session data:", sessionData);
           throw new Error("Incomplete session data.");
       }
   } catch (e: any) {
        console.error("[Action deleteEmployeeAction] Error fetching session data:", e.message);
        return { success: false, error: 'Failed to verify session: ' + e.message };
   }

   const { tenantId, userRolePerformingAction, tenantDomain } = sessionData;

   if (userRolePerformingAction !== 'Admin' && userRolePerformingAction !== 'Manager') {
       console.warn(`[Action deleteEmployeeAction] Unauthorized attempt to delete employee ${id} for tenant ${tenantId}`);
       return { success: false, error: 'Unauthorized to delete employees.' };
   }

   console.log(`[Action deleteEmployeeAction] Attempting to delete employee ${id} for tenant: ${tenantId}`);

  try {
    const deleted = await dbDeleteEmployee(id, tenantId);
    if (deleted) {
       console.log(`[Action deleteEmployeeAction] Employee ${id} (and associated user if any) deleted successfully. Revalidating paths...`);
        revalidatePath(`/${tenantDomain}/employees`);
        revalidatePath(`/${tenantDomain}/dashboard`);
      return { success: true };
    } else {
       console.warn(`[Action deleteEmployeeAction] Employee ${id} not found for tenant ${tenantId} during deletion.`);
      return { success: false, error: 'Employee not found for this tenant.' };
    }
  } catch (error: any) {
    console.error(`[Action deleteEmployeeAction] Error calling dbDeleteEmployee for ${id}:`, error.message, error.stack ? error.stack : '(No stack trace)');
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
