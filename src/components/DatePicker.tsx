import { useState } from 'react'
import { format } from 'date-fns'
import { CalendarIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

interface DatePickerProps {
  value: string // yyyy-MM-dd
  onChange: (date: string) => void
  maxDate?: Date
}

export function DatePicker({ value, onChange, maxDate }: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const selected = value ? new Date(value) : new Date()

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="h-8 text-[12px] text-[#0F1E3C] border-[#E2E8F0] bg-[#F8FAFC] hover:bg-white gap-2 font-normal"
        >
          <CalendarIcon size={13} className="text-gray-400" />
          {format(selected, 'dd MMM yyyy')}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(date) => {
            if (date) {
              onChange(format(date, 'yyyy-MM-dd'))
              setOpen(false)
            }
          }}
          disabled={(date) => date > (maxDate ?? new Date())}
        />
      </PopoverContent>
    </Popover>
  )
}