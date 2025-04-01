import React, { ReactNode } from 'react';
import { TabsTrigger } from '@/components/ui/tabs';
import { LucideIcon } from 'lucide-react';

interface CustomTabProps {
  value: string;
  className?: string;
  onClick?: () => void;
  icon: React.ElementType;
  children: ReactNode;
}

export function CustomTab({ value, className = "", onClick, icon: Icon, children }: CustomTabProps) {
  return (
    <TabsTrigger 
      value={value} 
      className={`flex items-center ${className}`}
      onClick={onClick}
    >
      <Icon className="h-4 w-4 mr-2" />
      {children}
    </TabsTrigger>
  );
}