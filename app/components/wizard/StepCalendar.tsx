'use client';

import { useState, useEffect } from 'react';
import {
  format, addMonths, subMonths, startOfMonth, endOfMonth,
  eachDayOfInterval, isSameDay, isToday, isPast,
  setHours, setMinutes
} from 'date-fns';

interface StepCalendarProps {
  scheduledAt: Date | null;
  setScheduledAt: (d: Date | null) => void;
  sendNow: boolean;
  setSendNow: (v: boolean) => void;
  onNext: () => void;
  onBack: () => void;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export default function StepCalendar({
  scheduledAt,
  setScheduledAt,
  sendNow,
  setSendNow,
  onNext,
  onBack,
}: StepCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(scheduledAt || new Date());
  const [selectedHour, setSelectedHour] = useState('09');
  const [selectedMinute, setSelectedMinute] = useState('00');
  const [selectedAmPm, setSelectedAmPm] = useState<'AM' | 'PM'>('AM');

  useEffect(() => {
    if (scheduledAt) {
      const h = scheduledAt.getHours();
      setSelectedAmPm(h >= 12 ? 'PM' : 'AM');
      setSelectedHour((h % 12 || 12).toString().padStart(2, '0'));
      setSelectedMinute(scheduledAt.getMinutes().toString().padStart(2, '0'));
    }
  }, [scheduledAt]);

  const handleDateSelect = (date: Date) => {
    let newDate = new Date(date);
    let h = parseInt(selectedHour, 10);
    if (selectedAmPm === 'PM' && h < 12) h += 12;
    if (selectedAmPm === 'AM' && h === 12) h = 0;

    newDate = setHours(newDate, h);
    newDate = setMinutes(newDate, parseInt(selectedMinute, 10));
    newDate.setSeconds(0);
    newDate.setMilliseconds(0);

    setScheduledAt(newDate);
    setSendNow(false);
  };

  const handleTimeChange = (type: 'hour' | 'minute' | 'ampm', value: string) => {
    if (!scheduledAt) return;

    let h = type === 'hour' ? parseInt(value, 10) : parseInt(selectedHour, 10);
    const m = type === 'minute' ? parseInt(value, 10) : parseInt(selectedMinute, 10);
    const ampm = type === 'ampm' ? value : selectedAmPm;

    if (type === 'hour') setSelectedHour(value);
    if (type === 'minute') setSelectedMinute(value);
    if (type === 'ampm') setSelectedAmPm(ampm as 'AM' | 'PM');

    if (ampm === 'PM' && h < 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;

    let newDate = setHours(scheduledAt, h);
    newDate = setMinutes(newDate, m);
    setScheduledAt(newDate);
  };

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDayOfWeek = monthStart.getDay();
  const blankDays = Array.from({ length: startDayOfWeek });

  const canProceed = sendNow || scheduledAt !== null;

  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold font-heading text-white">When should your emails be sent?</h2>
        <p className="text-cp-grey">Choose to launch immediately or schedule for a future date.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Send Now Card */}
        <button
          onClick={() => { setSendNow(true); setScheduledAt(null); }}
          className={`
            relative p-6 rounded-2xl border text-left transition-all duration-200 group overflow-hidden
            ${sendNow
              ? 'bg-white/5 border-white ring-1 ring-white shadow-[0_0_30px_rgba(255,255,255,0.08)]'
              : 'bg-cp-dark border-cp-border hover:border-cp-muted hover:bg-cp-charcoal'}
          `}
        >
          <div className="flex items-start space-x-4">
            <div className={`p-3 rounded-xl ${sendNow ? 'bg-white text-black' : 'bg-cp-border text-cp-grey group-hover:text-cp-light'}`}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h3 className={`text-lg font-semibold font-heading ${sendNow ? 'text-white' : 'text-white'}`}>Send immediately</h3>
              <p className="text-sm text-cp-grey mt-1">Campaign will start processing as soon as you launch.</p>
            </div>
          </div>
          {sendNow && (
            <div className="absolute top-4 right-4 text-white">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          )}
        </button>

        {/* Schedule Card */}
        <button
          onClick={() => { setSendNow(false); if (!scheduledAt) handleDateSelect(new Date()); }}
          className={`
            relative p-6 rounded-2xl border text-left transition-all duration-200 group overflow-hidden
            ${!sendNow && scheduledAt !== null
              ? 'bg-white/5 border-white ring-1 ring-white shadow-[0_0_30px_rgba(255,255,255,0.08)]'
              : 'bg-cp-dark border-cp-border hover:border-cp-muted hover:bg-cp-charcoal'}
          `}
        >
          <div className="flex items-start space-x-4">
            <div className={`p-3 rounded-xl ${!sendNow && scheduledAt ? 'bg-white text-black' : 'bg-cp-border text-cp-grey group-hover:text-cp-light'}`}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h3 className={`text-lg font-semibold font-heading ${!sendNow && scheduledAt ? 'text-white' : 'text-white'}`}>Pick a date & time</h3>
              <p className="text-sm text-cp-grey mt-1">Schedule your campaign for a specific future moment.</p>
            </div>
          </div>
          {!sendNow && scheduledAt && (
            <div className="absolute top-4 right-4 text-white">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          )}
        </button>
      </div>

      {/* Calendar & Time Picker */}
      {!sendNow && scheduledAt !== null && (
        <div className="bg-cp-dark border border-cp-border rounded-2xl p-6 max-w-md mx-auto">
          {/* Month Navigation */}
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              className="p-2 hover:bg-cp-border rounded-lg text-cp-grey hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h4 className="text-white font-medium text-lg">
              {format(currentMonth, 'MMMM yyyy')}
            </h4>
            <button
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              className="p-2 hover:bg-cp-border rounded-lg text-cp-grey hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1 mb-6">
            {WEEKDAYS.map(day => (
              <div key={day} className="text-center text-xs font-semibold text-cp-grey py-2">
                {day}
              </div>
            ))}

            {blankDays.map((_, i) => (
              <div key={`blank-${i}`} className="p-2" />
            ))}

            {daysInMonth.map(day => {
              const isSelected = scheduledAt && isSameDay(day, scheduledAt);
              const isPastDay = isPast(day) && !isToday(day);

              return (
                <button
                  key={day.toISOString()}
                  disabled={isPastDay}
                  onClick={() => handleDateSelect(day)}
                  className={`
                    w-10 h-10 mx-auto rounded-full flex items-center justify-center text-sm transition-all
                    ${isPastDay ? 'text-cp-muted cursor-not-allowed opacity-50' : 'hover:bg-cp-border'}
                    ${isToday(day) && !isSelected ? 'text-white font-bold bg-white/5' : ''}
                    ${isSelected ? 'bg-white text-black font-semibold shadow-[0_0_15px_rgba(255,255,255,0.2)] hover:bg-cp-light' : 'text-cp-light'}
                  `}
                >
                  {format(day, 'd')}
                </button>
              );
            })}
          </div>

          {/* Time Picker */}
          <div className="pt-6 border-t border-cp-border">
            <label className="block text-sm font-medium text-cp-grey mb-3">Time</label>
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-cp-black border border-cp-border rounded-lg">
                <input
                  type="text"
                  value={selectedHour}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 2);
                    const num = parseInt(val, 10);
                    if (val === '' || (num >= 1 && num <= 12)) {
                      setSelectedHour(val);
                      if (val && num >= 1 && num <= 12) handleTimeChange('hour', val.padStart(2, '0'));
                    }
                  }}
                  onBlur={() => {
                    const num = parseInt(selectedHour, 10);
                    if (!selectedHour || isNaN(num) || num < 1) setSelectedHour('12');
                    else if (num > 12) setSelectedHour('12');
                    else setSelectedHour(num.toString().padStart(2, '0'));
                  }}
                  className="w-12 bg-transparent text-white text-center text-lg font-mono py-3 outline-none"
                  placeholder="12"
                />
                <span className="text-cp-grey text-lg font-mono">:</span>
                <input
                  type="text"
                  value={selectedMinute}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 2);
                    const num = parseInt(val, 10);
                    if (val === '' || (num >= 0 && num <= 59)) {
                      setSelectedMinute(val);
                      if (val.length === 2 && num >= 0 && num <= 59) handleTimeChange('minute', val);
                    }
                  }}
                  onBlur={() => {
                    const num = parseInt(selectedMinute, 10);
                    if (!selectedMinute || isNaN(num)) setSelectedMinute('00');
                    else if (num > 59) setSelectedMinute('59');
                    else setSelectedMinute(num.toString().padStart(2, '0'));
                  }}
                  className="w-12 bg-transparent text-white text-center text-lg font-mono py-3 outline-none"
                  placeholder="00"
                />
              </div>

              <div className="flex bg-cp-black border border-cp-border rounded-lg overflow-hidden p-1">
                <button
                  onClick={() => handleTimeChange('ampm', 'AM')}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${selectedAmPm === 'AM' ? 'bg-white text-black' : 'text-cp-grey hover:text-white'}`}
                >
                  AM
                </button>
                <button
                  onClick={() => handleTimeChange('ampm', 'PM')}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${selectedAmPm === 'PM' ? 'bg-white text-black' : 'text-cp-grey hover:text-white'}`}
                >
                  PM
                </button>
              </div>
            </div>

            {scheduledAt && (
              <p className="mt-4 text-sm text-white">
                Scheduled for {format(scheduledAt, 'EEEE, MMMM d, yyyy')} at {format(scheduledAt, 'h:mm a')}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="flex justify-between pt-4">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-cp-grey hover:text-white hover:bg-cp-border transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <button
          onClick={onNext}
          disabled={!canProceed}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-all ${
            canProceed
              ? 'bg-white text-black hover:bg-cp-light shadow-lg'
              : 'bg-cp-border text-cp-grey cursor-not-allowed'
          }`}
        >
          Next
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
