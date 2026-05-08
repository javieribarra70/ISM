import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface User {
  id: number;
  username: string;
  email?: string;
}

interface AvatarsProps {
  users: User[];
  maxVisible?: number;
}

export function Avatars({ users, maxVisible = 3 }: AvatarsProps) {
  if (!users || users.length === 0) {
    return (
      <div className="flex -space-x-2">
        <Avatar className="h-8 w-8 border-2 border-white">
          <AvatarFallback className="bg-gray-200 text-gray-500 text-xs">?</AvatarFallback>
        </Avatar>
      </div>
    );
  }

  const visibleUsers = users.slice(0, maxVisible);
  const remainingCount = users.length - maxVisible;

  return (
    <div className="flex -space-x-2">
      <TooltipProvider>
        {visibleUsers.map((user) => (
          <Tooltip key={user.id}>
            <TooltipTrigger asChild>
              <Avatar className="h-8 w-8 border-2 border-white">
                <AvatarFallback className="bg-primary-light text-primary">
                  {user.username.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            <TooltipContent>
              <p>{user.username}</p>
            </TooltipContent>
          </Tooltip>
        ))}

        {remainingCount > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Avatar className="h-8 w-8 border-2 border-white bg-gray-100 flex items-center justify-center">
                <span className="text-xs text-gray-600">+{remainingCount}</span>
              </Avatar>
            </TooltipTrigger>
            <TooltipContent>
              <p>{remainingCount} more user{remainingCount > 1 ? 's' : ''}</p>
            </TooltipContent>
          </Tooltip>
        )}
      </TooltipProvider>
    </div>
  );
}
