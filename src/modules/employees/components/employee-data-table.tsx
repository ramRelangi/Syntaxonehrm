
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
import type { Employee } from "@/modules/employees/types";
// ActionsCell component is defined in employee-table-columns.tsx

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  onEmployeeDeleted: () => void; // Callback for when an employee is deleted
  tenantDomain: string; // Add tenant domain prop
}

export function EmployeeDataTable<TData extends Employee, TValue>({
  columns,
  data,
  onEmployeeDeleted, // Receive callback
  tenantDomain, // Receive tenant domain
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});

  // Inject the onEmployeeDeleted and tenantDomain callbacks into the actions cell component's props
  const tableColumns = React.useMemo(() => columns.map(col => {
      // Find the 'actions' column and modify its cell renderer
      if (col.id === 'actions' && col.cell) {
          const OriginalCell = col.cell as React.FC<any>; // Cast to access component props
          return {
              ...col,
              // Replace the cell renderer with a new one that passes the callback and domain
              cell: (props: any) => <OriginalCell {...props} onEmployeeDeleted={onEmployeeDeleted} tenantDomain={tenantDomain} />
          };
      }
      return col;
  }), [columns, onEmployeeDeleted, tenantDomain]); // Add tenantDomain dependency


  const table = useReactTable({
    data,
    columns: tableColumns, // Use the modified columns
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
        pageSize: 10,
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
            // Filter on the 'name' column (server-side filtering might be better for large datasets)
            value={(table.getColumn("name")?.getFilterValue() as string) ?? ""}
            onChange={(event) => {
               table.getColumn("name")?.setFilterValue(event.target.value)
               // Consider also filtering email client-side or rely on backend search
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
                  table.getColumn("status")?.setFilterValue(newFilter.length > 0 ? newFilter : undefined);
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
            <Button variant="outline" className=""> {/* Removed ml-auto */}
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
                  colSpan={tableColumns.length}
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
