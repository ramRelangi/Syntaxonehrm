export interface Employee {
  id: string;
  name: string;
  email: string;
  phone?: string;
  position: string;
  department: string;
  hireDate: string; // Store as ISO string (e.g., '2024-01-15') for simplicity
  status: 'Active' | 'Inactive' | 'On Leave';
}

// Schema for validation can be derived or defined separately if needed
