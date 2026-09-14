import { useAuthStore } from '@/store/auth-store';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LogIn } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function OIDCLoginView() {
  const { t } = useTranslation('auth');
  const { config, loginOIDC } = useAuthStore();

  const providerName = config?.oidc.provider || 'OIDC Provider';

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-4">
            <img
              src="/garage.png"
              alt={t('login.logoAlt')}
              className="h-16 w-16 object-contain"
            />
          </div>
          <CardTitle className="text-2xl text-center">{t('login.title')}</CardTitle>
          <CardDescription className="text-center">
            {t('login.authenticateWith', { provider: providerName })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={loginOIDC}
            className="w-full"
            size="lg"
          >
            <LogIn className="mr-2 h-5 w-5" />
            {t('login.continueWith', { provider: providerName })}
          </Button>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            {t('login.redirectNotice', { provider: providerName })}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
