"use client";

import * as React from "react";
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Search, Filter } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Employee } from "@/modules/employees/types"; // Updated import path

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
}

export function EmployeeDataTable<TData extends Employee, TValue>({ // Ensure TData extends Employee
  columns,
  data,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
   const [rowSelection, setRowSelection] = React.useState({}); // If needed for bulk actions

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
     onColumnVisibilityChange: setColumnVisibility,
     onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
     initialState: {
      pagination: {
        pageSize: 10, // Set default page size
      },
    },
  });

  const statusFilterOptions: Employee['status'][] = ['Active', 'Inactive', 'On Leave'];

  return (
    <div className="w-full">
      {/* Filters and Column Visibility */}
      <div className="flex items-center py-4 gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
           <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
           <Input
            placeholder="Filter by name or email..."
            value={(table.getColumn("name")?.getFilterValue() as string) ?? ""}
            onChange={(event) => {
               // Apply filter to both name and email for broader search
               table.getColumn("name")?.setFilterValue(event.target.value);
               // Optionally filter email separately if needed, or combine logic
               // table.getColumn("email")?.setFilterValue(event.target.value)
            }}
            className="pl-8 w-full md:w-[300px]"
          />
        </div>

        {/* Status Filter Dropdown */}
         <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="ml-auto">
              <Filter className="mr-2 h-4 w-4" /> Status <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
             <DropdownMenuSeparator />
             {statusFilterOptions.map((status) => (
               <DropdownMenuCheckboxItem
                key={status}
                className="capitalize"
                checked={(table.getColumn("status")?.getFilterValue() as string[] ?? []).includes(status)}
                onCheckedChange={(value) => {
                  const currentFilter = table.getColumn("status")?.getFilterValue() as string[] ?? [];
                  const newFilter = value
                    ? [...currentFilter, status]
                    : currentFilter.filter(s => s !== status);
                  table.getColumn("status")?.setFilterValue(newFilter.length > 0 ? newFilter : undefined); // Set to undefined if empty
                }}
              >
                {status}
              </DropdownMenuCheckboxItem>
            ))}
             <DropdownMenuSeparator />
             <DropdownMenuItem onSelect={() => table.getColumn("status")?.setFilterValue(undefined)}>
                Clear Filter
             </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

         {/* Column Visibility Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="ml-auto">
              Columns <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
             <DropdownMenuLabel>Toggle Columns</DropdownMenuLabel>
             <DropdownMenuSeparator />
            {table
              .getAllColumns()
              .filter((column) => column.getCanHide())
              .map((column) => {
                return (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize"
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) =>
                      column.toggleVisibility(!!value)
                    }
                  >
                    {column.id === 'hireDate' ? 'Hire Date' : column.id}
                  </DropdownMenuCheckboxItem>
                )
              })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

       {/* Display Active Filters */}
       <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground flex-wrap">
          {(table.getColumn("name")?.getFilterValue() as string) && (
             <Badge variant="secondary" className="flex items-center gap-1">
               Text: "{(table.getColumn("name")?.getFilterValue() as string)}"
               <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => table.getColumn("name")?.setFilterValue(undefined)}>✕</Button>
             </Badge>
           )}
           {(table.getColumn("status")?.getFilterValue() as string[] ?? []).length > 0 && (
             <Badge variant="secondary" className="flex items-center gap-1">
               Status: {(table.getColumn("status")?.getFilterValue() as string[]).join(', ')}
               <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => table.getColumn("status")?.setFilterValue(undefined)}>✕</Button>
             </Badge>
           )}
           {((table.getColumn("name")?.getFilterValue() as string) || (table.getColumn("status")?.getFilterValue() as string[] ?? []).length > 0) && (
             <Button variant="link" className="h-auto p-0 text-xs" onClick={() => { table.resetColumnFilters() }}>
               Clear all filters
             </Button>
           )}
        </div>


      {/* Data Table */}
      <div className="rounded-md border shadow-sm">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No results found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Controls */}
       <div className="flex items-center justify-end space-x-2 py-4">
         <div className="flex-1 text-sm text-muted-foreground">
           {/* Show selection count if needed */}
           {/* {table.getFilteredSelectedRowModel().rows.length} of{" "} */}
           {table.getFilteredRowModel().rows.length} row(s) displayed.
         </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
