import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { InfoIcon } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface InviteUsersModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: number;
  onInviteSent: () => void;
}

export default function InviteUsersModal({
  isOpen,
  onClose,
  projectId,
  onInviteSent
}: InviteUsersModalProps) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("user");
  const [sendEmail, setSendEmail] = useState(true);
  const [invitationLink, setInvitationLink] = useState("");
  
  // Create invitation mutation
  const createInvitationMutation = useMutation({
    mutationFn: async (data: { email: string; role: string }) => {
      const response = await apiRequest(
        "POST", 
        `/api/projects/${projectId}/invitations`, 
        data
      );
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Invitation created successfully",
        description: sendEmail 
          ? `An invitation has been sent to ${email}` 
          : "Invitation link generated",
      });
      setInvitationLink(`${window.location.origin}/invite/${data.token}`);
      
      if (!sendEmail) {
        // If not sending email, don't close the modal so user can copy the link
        return;
      }
      
      // Reset form and close modal
      setEmail("");
      setRole("user");
      setSendEmail(true);
      onInviteSent();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create invitation",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email) {
      toast({
        title: "Email required",
        description: "Please enter an email address",
        variant: "destructive",
      });
      return;
    }
    
    createInvitationMutation.mutate({ email, role });
  };
  
  const handleGenerateLink = () => {
    if (!email) {
      toast({
        title: "Email required",
        description: "Please enter an email address to generate an invitation link",
        variant: "destructive",
      });
      return;
    }
    
    setSendEmail(false);
    createInvitationMutation.mutate({ email, role });
  };
  
  const handleCopyLink = () => {
    navigator.clipboard.writeText(invitationLink);
    toast({
      title: "Link copied to clipboard",
      description: "You can now share this link with the user",
    });
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Invite Users</DialogTitle>
          <DialogDescription>
            Invite team members to collaborate on this project.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="invite-email">Email Address</Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                required
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="invite-role">Role</Label>
              <Select
                value={role}
                onValueChange={setRole}
              >
                <SelectTrigger id="invite-role">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="admin">Administrator</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-start space-x-2 pt-2">
              <Checkbox 
                id="send-email" 
                checked={sendEmail}
                onCheckedChange={(checked) => setSendEmail(checked as boolean)}
              />
              <div className="grid gap-1.5 leading-none">
                <Label
                  htmlFor="send-email"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Send email invitation
                </Label>
                <p className="text-sm text-muted-foreground">
                  An email with the invitation link will be sent to the user.
                </p>
              </div>
            </div>
            
            {invitationLink && (
              <div className="mt-4 p-3 bg-gray-50 rounded-md">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <InfoIcon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="ml-3 flex-1">
                    <p className="text-sm text-gray-700 mb-2">
                      Invitation link:
                    </p>
                    <div className="flex">
                      <Input 
                        value={invitationLink} 
                        readOnly 
                        className="text-xs"
                      />
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="ml-2"
                        onClick={handleCopyLink}
                      >
                        Copy
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          <DialogFooter className="flex-col space-y-2 sm:space-y-0">
            {!invitationLink && (
              <div className="flex flex-col space-y-2 sm:space-y-0 sm:flex-row sm:space-x-2 w-full">
                <Button
                  type="button"
                  variant="outline"
                  className="sm:flex-1"
                  onClick={handleGenerateLink}
                  disabled={createInvitationMutation.isPending}
                >
                  Generate Link
                </Button>
                <Button
                  type="submit"
                  className="sm:flex-1"
                  disabled={createInvitationMutation.isPending}
                >
                  {createInvitationMutation.isPending 
                    ? "Sending..." 
                    : "Send Invitation"}
                </Button>
              </div>
            )}
            
            {invitationLink && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setInvitationLink("");
                  setEmail("");
                  setRole("user");
                  setSendEmail(true);
                }}
              >
                Create Another Invitation
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
