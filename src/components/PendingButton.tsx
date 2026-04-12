'use client';

import { useFormStatus } from 'react-dom';

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  pendingChildren?: React.ReactNode;
  pendingClassName?: string;
}

export default function PendingButton({
  children,
  pendingChildren,
  className,
  pendingClassName,
  disabled,
  ...props
}: Props) {
  const { pending } = useFormStatus();
  return (
    <button
      {...props}
      disabled={pending || disabled}
      className={pending && pendingClassName ? pendingClassName : className}
    >
      {pending && pendingChildren !== undefined ? pendingChildren : children}
    </button>
  );
}
