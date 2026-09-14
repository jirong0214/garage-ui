import { Check, Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { normalizeLanguage, type SupportedLanguage } from '@/i18n';

const choices: Array<{ value: SupportedLanguage; labelKey: 'language.english' | 'language.chineseSimplified' }> = [
  { value: 'en-US', labelKey: 'language.english' },
  { value: 'zh-CN', labelKey: 'language.chineseSimplified' },
];

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation('common');
  const active = normalizeLanguage(i18n.resolvedLanguage ?? i18n.language) ?? 'en-US';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={buttonVariants({ variant: 'ghost', size: 'icon' })}
        aria-label={t('language.label')}
        title={t('language.label')}
      >
        <Languages className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {choices.map((choice) => (
          <DropdownMenuItem key={choice.value} onClick={() => void i18n.changeLanguage(choice.value)}>
            <span className="flex-1">{t(choice.labelKey)}</span>
            {active === choice.value && <Check className="h-4 w-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
