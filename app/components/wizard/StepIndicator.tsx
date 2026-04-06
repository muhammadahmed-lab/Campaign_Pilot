'use client';

interface StepIndicatorProps {
  currentStep: number;
}

const STEPS = [
  { id: 1, label: 'Schedule' },
  { id: 2, label: 'Content' },
  { id: 3, label: 'Template' },
  { id: 4, label: 'Recipients' },
  { id: 5, label: 'Launch' },
];

export default function StepIndicator({ currentStep }: StepIndicatorProps) {
  return (
    <div className="relative">
      {/* Background connecting line */}
      <div className="absolute top-5 left-0 w-full h-[2px] bg-cp-border -z-10 hidden sm:block" />

      {/* Active connecting line */}
      <div
        className="absolute top-5 left-0 h-[2px] bg-white -z-10 hidden sm:block transition-all duration-500 ease-in-out"
        style={{ width: `${((currentStep - 1) / (STEPS.length - 1)) * 100}%` }}
      />

      <div className="flex justify-between items-start">
        {STEPS.map((step) => {
          const isCompleted = step.id < currentStep;
          const isCurrent = step.id === currentStep;
          const isFuture = step.id > currentStep;

          return (
            <div key={step.id} className="flex flex-col items-center relative">
              <div
                className={`
                  w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300
                  ${isCompleted ? 'bg-white text-black shadow-[0_0_15px_rgba(255,255,255,0.3)]' : ''}
                  ${isCurrent ? 'bg-cp-dark border-2 border-white text-white ring-4 ring-white/10' : ''}
                  ${isFuture ? 'bg-cp-border text-cp-grey border border-cp-muted' : ''}
                `}
              >
                {isCompleted ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  step.id
                )}
              </div>

              <span
                className={`
                  mt-3 text-sm font-medium transition-colors duration-300
                  ${isCurrent ? 'text-white block' : ''}
                  ${isCompleted ? 'text-cp-light hidden sm:block' : ''}
                  ${isFuture ? 'text-cp-muted hidden sm:block' : ''}
                `}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
