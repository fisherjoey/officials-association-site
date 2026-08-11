'use client'

import { useId, Fragment } from 'react'
import { Listbox, ListboxButton, ListboxOptions, ListboxOption, Transition } from '@headlessui/react'

function ChevronUpDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M10 3a1 1 0 01.707.293l3 3a1 1 0 01-1.414 1.414L10 5.414 7.707 7.707a1 1 0 01-1.414-1.414l3-3A1 1 0 0110 3zm-3.707 9.293a1 1 0 011.414 0L10 14.586l2.293-2.293a1 1 0 011.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
    </svg>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  )
}

interface Option {
  value: string
  label: string
}

interface OptionGroup {
  group: string
  options: Option[]
}

interface SelectInputProps {
  label?: string
  value: string
  onChange: (value: string) => void
  options?: Option[]
  groupedOptions?: OptionGroup[]
  placeholder?: string
  error?: string
  disabled?: boolean
  required?: boolean
  className?: string
  name?: string
}

export default function SelectInput({
  label,
  value,
  onChange,
  options = [],
  groupedOptions,
  placeholder = 'Select an option',
  error,
  disabled = false,
  required = false,
  className = '',
  name,
}: SelectInputProps) {
  const labelId = useId()
  const errorId = useId()

  // Flatten options for lookup
  const allOptions: Option[] = groupedOptions
    ? groupedOptions.flatMap(g => g.options)
    : options

  // Find selected option
  const selectedOption = allOptions.find(opt => opt.value === value)

  // Check if we have any options
  const hasOptions = allOptions.length > 0

  // Button classes based on state
  const buttonClasses = [
    'relative w-full cursor-pointer rounded-lg py-2 pl-3 pr-10 text-left',
    'border transition-colors',
    'focus:outline-none focus:ring-2',
    'bg-white dark:bg-gray-800',
    error
      ? 'border-red-500 focus:ring-red-500 dark:border-red-400'
      : 'border-gray-300 dark:border-gray-600 focus:ring-blue-400',
    disabled
      ? 'cursor-not-allowed opacity-60 bg-gray-50 dark:bg-gray-900'
      : 'hover:border-gray-400 dark:hover:border-gray-500',
    className,
  ].filter(Boolean).join(' ')

  return (
    <div className="w-full">
      <Listbox value={value} onChange={onChange} disabled={disabled || !hasOptions} name={name}>
        {label && (
          <Listbox.Label
            id={labelId}
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </Listbox.Label>
        )}

        <div className="relative">
          <ListboxButton
            className={buttonClasses}
            aria-invalid={!!error}
            aria-describedby={error ? errorId : undefined}
          >
            <span className={`block truncate ${!selectedOption ? 'text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-gray-100'}`}>
              {selectedOption?.label || placeholder}
            </span>
            <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
              <ChevronUpDownIcon
                className="h-5 w-5 text-gray-400 dark:text-gray-500"
                aria-hidden="true"
              />
            </span>
          </ListboxButton>

          <Transition
            as={Fragment}
            leave="transition ease-in duration-100"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <ListboxOptions className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg bg-white dark:bg-gray-800 py-1 text-base shadow-lg ring-1 ring-black/5 dark:ring-white/10 focus:outline-none">
              {/* Placeholder option if not required */}
              {placeholder && !required && (
                <ListboxOption
                  value=""
                  className={({ active }) =>
                    `relative cursor-pointer select-none py-2 pl-10 pr-4 ${
                      active ? 'bg-blue-900/40 text-blue-100' : 'text-gray-500 dark:text-gray-400'
                    }`
                  }
                >
                  {({ selected }) => (
                    <>
                      <span className={`block truncate ${selected ? 'font-medium' : 'font-normal'}`}>
                        {placeholder}
                      </span>
                      {selected && (
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-blue-400">
                          <CheckIcon className="h-5 w-5" aria-hidden="true" />
                        </span>
                      )}
                    </>
                  )}
                </ListboxOption>
              )}

              {groupedOptions ? (
                // Render grouped options
                groupedOptions.map((group) => (
                  <div key={group.group}>
                    <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider bg-gray-50 dark:bg-gray-700/50">
                      {group.group}
                    </div>
                    {group.options.map((option) => (
                      <ListboxOption
                        key={`${group.group}-${option.value}`}
                        value={option.value}
                        className={({ active }) =>
                          `relative cursor-pointer select-none py-2 pl-10 pr-4 ${
                            active ? 'bg-blue-900/40 text-blue-100' : 'text-gray-900 dark:text-gray-100'
                          }`
                        }
                      >
                        {({ selected }) => (
                          <>
                            <span className={`block truncate ${selected ? 'font-medium' : 'font-normal'}`}>
                              {option.label}
                            </span>
                            {selected && (
                              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-blue-400">
                                <CheckIcon className="h-5 w-5" aria-hidden="true" />
                              </span>
                            )}
                          </>
                        )}
                      </ListboxOption>
                    ))}
                  </div>
                ))
              ) : (
                // Render flat options
                options.map((option) => (
                  <ListboxOption
                    key={option.value}
                    value={option.value}
                    className={({ active }) =>
                      `relative cursor-pointer select-none py-2 pl-10 pr-4 ${
                        active ? 'bg-blue-900/40 text-blue-100' : 'text-gray-900 dark:text-gray-100'
                      }`
                    }
                  >
                    {({ selected }) => (
                      <>
                        <span className={`block truncate ${selected ? 'font-medium' : 'font-normal'}`}>
                          {option.label}
                        </span>
                        {selected && (
                          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-blue-400">
                            <CheckIcon className="h-5 w-5" aria-hidden="true" />
                          </span>
                        )}
                      </>
                    )}
                  </ListboxOption>
                ))
              )}
            </ListboxOptions>
          </Transition>
        </div>
      </Listbox>

      {error && (
        <p
          id={errorId}
          className="mt-1 text-sm text-red-600 dark:text-red-400"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  )
}
