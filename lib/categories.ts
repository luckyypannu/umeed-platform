export const categories = [
  {
    id: 'food-support',
    label: 'Food Support',
    i18nKey: 'publicShell.categoryFood',
  },
  {
    id: 'healthcare',
    label: 'Healthcare',
    i18nKey: 'publicShell.categoryHealthcare',
  },
  {
    id: 'education',
    label: 'Education',
    i18nKey: 'publicShell.categoryEducation',
  },
  {
    id: 'elderly-support',
    label: 'Elderly Support',
    i18nKey: 'publicShell.categoryElderly',
  },
  {
    id: 'digital-assistance',
    label: 'Digital Assistance',
    i18nKey: 'publicShell.categoryDigital',
  },
  {
    id: 'mentoring',
    label: 'Mentoring',
    i18nKey: 'publicShell.categoryMentoring',
  },
  {
    id: 'essential-resources',
    label: 'Essential Resources',
    i18nKey: 'publicShell.categoryResources',
  },
] as const

export type SupportCategoryId = (typeof categories)[number]['id']
