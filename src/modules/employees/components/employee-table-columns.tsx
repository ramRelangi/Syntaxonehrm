
"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { Employee } from "@/modules/employees/types";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, MoreHorizontal, Pencil, Trash2, Eye } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useState } from "react";

// Helper function to determine badge variant based on status
const getStatusVariant = (status: Employee['status']): "default" | "secondary" | "outline" | "destructive" => {
  switch (status) {
    case 'Active':
      return 'default'; // Primary/Greenish in default themes
    case 'On Leave':
      return 'secondary'; // Yellowish/Orange in default themes
    case 'Inactive':
      return 'outline'; // Grayish
    default:
      return 'outline';
  }
};

// Action Cell Component for Delete Confirmation
const ActionsCell = ({ employeeId, employeeName, onEmployeeDeleted }: { employeeId: string, employeeName: string, onEmployeeDeleted: () => void }) => {
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      // API call uses the base path, tenant context is handled by header
      const response = await fetch(`/api/employees/${employeeId}`, {
        method: 'DELETE',
        // No need to explicitly pass tenantId here if API uses header from middleware
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `Failed to delete ${employeeName}. Please try again.` }));
        throw new Error(errorData.message || `Failed to delete ${employeeName}. Status: ${response.status}`);
      }

      toast({
        title: "Employee Deleted",
        description: `${employeeName} has been successfully deleted.`,
        className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
      });
      onEmployeeDeleted(); // Trigger callback to refetch data in parent component
    } catch (error: any) {
      toast({
        title: "Error Deleting Employee",
        description: error.message || `Failed to delete ${employeeName}. Please try again.`,
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
     <AlertDialog>
       <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">Open menu</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          {/* Update links to be relative to the tenant root */}
          <DropdownMenuItem asChild>
             <Link href={`/employees/${employeeId}/edit`} className="flex items-center">
               <Pencil className="mr-2 h-4 w-4" /> Edit
             </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
             <Link href={`/employees/${employeeId}`} className="flex items-center">
                 <Eye className="mr-2 h-4 w-4" /> View Details
             </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
           <AlertDialogTrigger asChild>
               <DropdownMenuItem className="text-destructive focus:text-destructive focus:bg-destructive/10 flex items-center" disabled={isDeleting}>
                  <Trash2 className="mr-2 h-4 w-4" /> Delete
               </DropdownMenuItem>
           </AlertDialogTrigger>
        </DropdownMenuContent>
      </DropdownMenu>

       {/* Delete Confirmation Dialog */}
       <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete the employee record for <strong>{employeeName}</strong>.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
             {isDeleting ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
     </AlertDialog>
  );
};


export const columns: ColumnDef<Employee>[] = [
   {
    accessorKey: "name",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Name
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
  },
  {
    accessorKey: "email",
    header: "Email",
  },
  {
    accessorKey: "position",
     header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Position
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
  },
  {
    accessorKey: "department",
     header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Department
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
  },
   {
    accessorKey: "hireDate",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Hire Date
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
     cell: ({ row }) => {
      const date = row.getValue("hireDate") as string;
      // Format date for display (optional, depends on desired format)
       try {
         return new Date(date).toLocaleDateString(); // Adjust format as needed
       } catch (e) {
         return date; // Fallback to raw string if parsing fails
       }
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.getValue("status") as Employee['status'];
      return <Badge variant={getStatusVariant(status)}>{status}</Badge>;
    },
     filterFn: (row, id, value) => {
      return value.includes(row.getValue(id))
    },
  },
   {
    id: "actions",
    // Pass props down to the custom ActionsCell component
    cell: ({ row, ...rest }) => {
      const employee = row.original;
      // Extract the injected prop from the rest of the cell context
      // @ts-ignore - `onEmployeeDeleted` is injected by EmployeeDataTable
      const { onEmployeeDeleted } = rest;
      return <ActionsCell employeeId={employee.id} employeeName={employee.name} onEmployeeDeleted={onEmployeeDeleted} />;
    },
  },
];
