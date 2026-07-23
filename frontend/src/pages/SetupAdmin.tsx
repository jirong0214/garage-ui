import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/store/auth-store';

export function SetupAdmin() {
  const navigate = useNavigate();
  const { config, user, setupAdmin } = useAuthStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const canSetup = config?.admin.bootstrap_required && user?.username === 'admin-token';

  if (!canSetup) {
    return <Navigate to="/" replace />;
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    try {
      await setupAdmin(username, password);
      await useAuthStore.getState().initialize();
      navigate('/', { replace: true });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-md bg-primary/10 text-primary"><ShieldCheck className="h-6 w-6" /></div>
          <CardTitle className="text-2xl">Create UI administrator</CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">This account is stored locally in Garage UI. The Garage admin token will no longer be accepted for sign-in after setup.</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2"><label htmlFor="setup-username" className="text-sm font-medium">Username</label><Input id="setup-username" value={username} onChange={(e) => setUsername(e.target.value)} minLength={3} required disabled={isLoading} autoComplete="username" /></div>
            <div className="space-y-2"><label htmlFor="setup-password" className="text-sm font-medium">Password</label><Input id="setup-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={12} required disabled={isLoading} autoComplete="new-password" /></div>
            <div className="space-y-2"><label htmlFor="setup-confirmation" className="text-sm font-medium">Confirm password</label><Input id="setup-confirmation" type="password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} required disabled={isLoading} autoComplete="new-password" /></div>
            <Button type="submit" className="w-full" disabled={isLoading || username.length < 3 || password.length < 12 || password !== confirmation}>{isLoading ? 'Creating account...' : 'Create administrator'}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
