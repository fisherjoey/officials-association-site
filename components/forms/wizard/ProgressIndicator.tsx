import React from 'react';
import { IconCheck } from '@tabler/icons-react';

interface ProgressIndicatorProps {
  currentStep: number;
  highestStepReached: number;
  onStepClick?: (step: number) => void;
}

const steps = [
  { number: 1, label: 'Organization' },
  { number: 2, label: 'Billing' },
  { number: 3, label: 'Event Contact' },
  { number: 4, label: 'Events' },
  { number: 5, label: 'Review' },
];

export default function ProgressIndicator({ currentStep, highestStepReached, onStepClick }: ProgressIndicatorProps) {
  const progressPercentage = (highestStepReached / steps.length) * 100;

  const getStepStatus = (stepNumber: number) => {
    // A step is completed if we've been past it (highestStepReached > stepNumber)
    if (stepNumber < highestStepReached) return 'completed';
    if (stepNumber === currentStep) return 'current';
    return 'future';
  };

  const handleStepClick = (stepNumber: number) => {
    // Allow clicking on any step we've already visited
    if (onStepClick && stepNumber <= highestStepReached) {
      onStepClick(stepNumber);
    }
  };

  return (
    <>
      {/* Mobile View */}
      <div className="md:hidden">
        <div className="text-center mb-2">
          <span className="text-sm font-medium text-gray-700">
            Step {currentStep} of {steps.length}
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-orange-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>

      {/* Desktop View */}
      <div className="hidden md:flex items-center justify-between">
        {steps.map((step, index) => {
          const status = getStepStatus(step.number);
          const isClickable = step.number <= highestStepReached && onStepClick;

          return (
            <React.Fragment key={step.number}>
              <div className="flex flex-col items-center">
                <button
                  onClick={() => handleStepClick(step.number)}
                  disabled={!isClickable}
                  className={`
                    relative flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all duration-200
                    ${status === 'completed' ? 'bg-green-500 border-green-500 text-white' : ''}
                    ${status === 'current' ? 'bg-orange-500 border-orange-500 text-white' : ''}
                    ${status === 'future' ? 'bg-white border-gray-300 text-gray-400' : ''}
                    ${isClickable ? 'cursor-pointer hover:scale-110' : 'cursor-default'}
                  `}
                >
                  {status === 'completed' ? (
                    <IconCheck size={28} stroke={3} />
                  ) : (
                    <span className="text-sm font-semibold">{step.number}</span>
                  )}
                </button>
                <span
                  className={`
                    mt-2 text-xs font-medium text-center
                    ${status === 'current' ? 'text-orange-500' : ''}
                    ${status === 'completed' ? 'text-green-600' : ''}
                    ${status === 'future' ? 'text-gray-400' : ''}
                  `}
                >
                  {step.label}
                </span>
              </div>

              {/* Connector Line */}
              {index < steps.length - 1 && (
                <div className="flex-1 h-0.5 mx-2 mb-6">
                  <div
                    className={`
                      h-full transition-all duration-300
                      ${step.number < highestStepReached ? 'bg-green-500' : 'bg-gray-300'}
                    `}
                  />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </>
  );
}
