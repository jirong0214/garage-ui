import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/store/auth-store';

export function Account() {
  const { user, updateAdminCredentials } = useAuthStore();
  const [username, setUsername] = useState(user?.username || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    try {
      await updateAdminCredentials(username, currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmation('');
    } finally {
      setIsLoading(false);
    }
  };

  const invalid = username.length < 3 || !currentPassword || newPassword.length < 12 || newPassword !== confirmation;
  return (
    <div className="mx-auto max-w-xl p-4 sm:p-6">
      <div className="mb-6"><h1 className="text-xl font-semibold">Account</h1><p className="mt-1 text-sm text-muted-foreground">Manage the local Garage UI administrator.</p></div>
      <Card>
        <CardHeader><CardTitle>Sign-in credentials</CardTitle><CardDescription>Changes take effect immediately and replace the active session.</CardDescription></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2"><label htmlFor="account-username" className="text-sm font-medium">Username</label><Input id="account-username" value={username} onChange={(e) => setUsername(e.target.value)} minLength={3} required disabled={isLoading} /></div>
            <div className="space-y-2"><label htmlFor="account-current" className="text-sm font-medium">Current password</label><Input id="account-current" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required disabled={isLoading} autoComplete="current-password" /></div>
            <div className="space-y-2"><label htmlFor="account-new" className="text-sm font-medium">New password</label><Input id="account-new" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={12} required disabled={isLoading} autoComplete="new-password" /></div>
            <div className="space-y-2"><label htmlFor="account-confirmation" className="text-sm font-medium">Confirm new password</label><Input id="account-confirmation" type="password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} required disabled={isLoading} autoComplete="new-password" /></div>
            <Button type="submit" disabled={isLoading || invalid}>{isLoading ? 'Saving...' : 'Save credentials'}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
