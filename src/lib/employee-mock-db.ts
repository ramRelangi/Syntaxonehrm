import type { Employee } from '@/types/employee';

// Simple in-memory store for employees
let employees: Employee[] = [
  {
    id: 'emp-001',
    name: 'Alice Wonderland',
    email: 'alice.w@example.com',
    phone: '123-456-7890',
    position: 'Software Engineer',
    department: 'Technology',
    hireDate: '2023-03-15',
    status: 'Active',
  },
  {
    id: 'emp-002',
    name: 'Bob The Builder',
    email: 'bob.b@example.com',
    position: 'Project Manager',
    department: 'Construction',
    hireDate: '2022-08-01',
    status: 'Active',
  },
  {
    id: 'emp-003',
    name: 'Charlie Chaplin',
    email: 'charlie.c@example.com',
    phone: '987-654-3210',
    position: 'HR Specialist',
    department: 'Human Resources',
    hireDate: '2024-01-10',
    status: 'Active',
  },
   {
    id: 'emp-004',
    name: 'Diana Prince',
    email: 'diana.p@example.com',
    position: 'Marketing Lead',
    department: 'Marketing',
    hireDate: '2021-05-20',
    status: 'On Leave',
  },
   {
    id: 'emp-005',
    name: 'Ethan Hunt',
    email: 'ethan.h@example.com',
    phone: '555-555-5555',
    position: 'Operations Manager',
    department: 'Operations',
    hireDate: '2020-11-01',
    status: 'Inactive',
  },
];

// --- Mock Database Operations ---

export function getAllEmployees(): Employee[] {
  // Return a deep copy to prevent direct modification of the store
  return JSON.parse(JSON.stringify(employees));
}

export function getEmployeeById(id: string): Employee | undefined {
  const employee = employees.find((emp) => emp.id === id);
  // Return a deep copy
  return employee ? JSON.parse(JSON.stringify(employee)) : undefined;
}

export function addEmployee(employeeData: Omit<Employee, 'id'>): Employee {
   const newId = `emp-${String(employees.length + 1).padStart(3, '0')}`;
   const newEmployee: Employee = {
     ...employeeData,
     id: newId,
   };
   employees.push(newEmployee);
   // Return a deep copy
   return JSON.parse(JSON.stringify(newEmployee));
}

export function updateEmployee(id: string, updates: Partial<Omit<Employee, 'id'>>): Employee | undefined {
  const index = employees.findIndex((emp) => emp.id === id);
  if (index !== -1) {
    employees[index] = { ...employees[index], ...updates };
     // Return a deep copy
    return JSON.parse(JSON.stringify(employees[index]));
  }
  return undefined;
}

export function deleteEmployee(id: string): boolean {
  const initialLength = employees.length;
  employees = employees.filter((emp) => emp.id !== id);
  return employees.length < initialLength;
}
