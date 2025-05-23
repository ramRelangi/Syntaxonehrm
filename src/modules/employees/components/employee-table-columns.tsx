
"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { Employee, EmployeeStatus } from "@/modules/employees/types";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, MoreHorizontal, Pencil, Trash2, Eye, CheckCircle, XCircle, CalendarClock, Dot } from "lucide-react";
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
} from "@/components/ui/alert-dialog"; 
import { useState } from "react";
import { useParams } from "next/navigation";
import { format, parseISO } from 'date-fns';

const getStatusVariant = (status?: EmployeeStatus): "default" | "secondary" | "outline" | "destructive" => {
  if (!status) return 'outline';
  switch (status) {
    case 'Active': return 'default';
    case 'On Leave': return 'secondary';
    case 'Inactive': return 'destructive';
    default: return 'outline';
  }
};

const getStatusIcon = (status?: EmployeeStatus) => {
  if (!status) return <Dot className="h-3 w-3 text-muted-foreground" />;
  switch (status) {
    case 'Active': return <CheckCircle className="h-3 w-3 text-green-500" />;
    case 'On Leave': return <CalendarClock className="h-3 w-3 text-blue-500" />;
    case 'Inactive': return <XCircle className="h-3 w-3 text-red-500" />;
    default: return <Dot className="h-3 w-3 text-muted-foreground" />;
  }
};

const ActionsCell = ({ employee, onEmployeeDeleted }: { employee: Employee, onEmployeeDeleted: () => void }) => {
  const { toast } = useToast();
  const params = useParams();
  const tenantDomain = params.domain as string;
  const [isDeleting, setIsDeleting] = useState(false);
  const [isAlertDialogOpen, setIsAlertDialogOpen] = useState(false);


  const handleDelete = async () => {
    if (!employee.id) return;
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/employees/${employee.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `Failed to delete ${employee.name}. Please try again.` }));
        throw new Error(errorData.message || `Failed to delete ${employee.name}. Status: ${response.status}`);
      }

      toast({
        title: "Employee Deleted",
        description: `${employee.name} has been successfully deleted.`,
        className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
      });
      onEmployeeDeleted();
      setIsAlertDialogOpen(false); 
    } catch (error: any) {
      toast({
        title: "Error Deleting Employee",
        description: error.message || `Failed to delete ${employee.name}. Please try again.`,
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
     <AlertDialog open={isAlertDialogOpen} onOpenChange={setIsAlertDialogOpen}>
       <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">Open menu</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Actions for {employee.name}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
             {/* Link to detail page using employee.id (PK) */}
             <Link href={`/${tenantDomain}/employees/${employee.id}`} className="flex items-center w-full">
                 <Eye className="mr-2 h-4 w-4" /> View Details
             </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
             <Link href={`/${tenantDomain}/employees/${employee.id}/edit`} className="flex items-center w-full">
               <Pencil className="mr-2 h-4 w-4" /> Edit Profile
             </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
            <DropdownMenuItem
               onSelect={() => setIsAlertDialogOpen(true)}
               className="text-destructive focus:text-destructive focus:bg-destructive/10 flex items-center w-full"
               disabled={isDeleting}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

       <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete the employee record for <strong>{employee.name}</strong> and their associated user account (if any).
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
    header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Name <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
    ),
    cell: ({ row }) => {
        const employee = row.original;
        const params = useParams();
        const tenantDomain = params.domain as string;
        // Link to detail page using employee.id (PK)
        return <Link href={`/${tenantDomain}/employees/${employee.id}`} className="hover:underline text-primary">{employee.name}</Link>;
    }
  },
  {
    accessorKey: "employeeId", 
    header: "Employee ID",
    cell: ({ row }) => row.original.employeeId || 'N/A',
  },
  {
    accessorKey: "email", 
    header: "Official Email",
  },
  {
    accessorKey: "position", 
     header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Position <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
    ),
    cell: ({ row }) => row.original.position || 'N/A',
  },
  {
    accessorKey: "department", 
     header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Department <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
    ),
    cell: ({ row }) => row.original.department || 'N/A',
  },
   {
    accessorKey: "hireDate", 
    header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Hire Date <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
    ),
     cell: ({ row }) => {
      const date = row.getValue("hireDate") as string | undefined | null;
      if (!date) return "N/A";
       try {
         return format(parseISO(date), "MMM d, yyyy");
       } catch (e) {
         return date; 
       }
    },
  },
  {
    accessorKey: "status", 
    header: "Status",
    cell: ({ row }) => {
      const status = row.original.status;
      return <Badge variant={getStatusVariant(status)} className="flex items-center gap-1 min-w-[80px] justify-center">
                {getStatusIcon(status)}
                {status}
             </Badge>;
    },
     filterFn: (row, id, value) => {
       const rowStatus = row.original.status;
       return Array.isArray(value) && value.includes(rowStatus);
    },
  },
   {
    id: "actions",
    cell: ({ row, table }) => {
      const employee = row.original;
      const onEmployeeDeleted = table.options.meta?.onEmployeeDeleted;
      return <ActionsCell employee={employee} onEmployeeDeleted={onEmployeeDeleted || (() => console.warn("onEmployeeDeleted not passed to ActionsCell"))} />;
    },
  },
];

declare module '@tanstack/react-table' {
  interface TableMeta<TData extends Employee> {
    onEmployeeDeleted?: () => void;
  }
}
