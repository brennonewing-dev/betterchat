import React from 'react';
import { useGetLiteLLMBudget } from '~/data-provider';
import { useAuthContext, useLocalize } from '~/hooks';
import { Spinner } from '@librechat/client';

function LiteLLMBudget() {
  const localize = useLocalize();
  const { isAuthenticated } = useAuthContext();

  const budgetQuery = useGetLiteLLMBudget({
    enabled: !!isAuthenticated,
  });

  const { data: budget, isLoading, isError } = budgetQuery;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-4 text-sm text-text-primary">
        <div className="flex items-center justify-center py-4">
          <Spinner className="h-5 w-5" />
        </div>
      </div>
    );
  }

  if (isError || !budget) {
    return (
      <div className="flex flex-col gap-4 p-4 text-sm text-text-primary">
        <div className="text-sm text-text-secondary">
          {localize('com_nav_litellm_budget_unavailable') || 'LiteLLM budget information unavailable'}
        </div>
      </div>
    );
  }

  const usagePercentage = budget.maxBudget > 0
    ? Math.min((budget.usedBudget / budget.maxBudget) * 100, 100)
    : 0;

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="flex flex-col gap-4 p-4 text-sm text-text-primary">
      {/* Header */}
      <div className="font-medium">
        {localize('com_nav_litellm_budget_title') || 'LiteLLM Budget'}
      </div>

      {/* Budget Usage Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-text-secondary">
            {localize('com_nav_litellm_budget_used') || 'Used'}
          </span>
          <span className="font-medium">
            ${budget.usedBudget.toFixed(2)} / ${budget.maxBudget.toFixed(2)}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-tertiary">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              usagePercentage >= 90
                ? 'bg-red-500'
                : usagePercentage >= 70
                  ? 'bg-yellow-500'
                  : 'bg-green-500'
            }`}
            style={{ width: `${usagePercentage}%` }}
          />
        </div>
      </div>

      {/* Remaining Budget */}
      <div className="flex items-center justify-between">
        <span className="text-text-secondary">
          {localize('com_nav_litellm_budget_remaining') || 'Remaining'}
        </span>
        <span className="font-medium text-green-600 dark:text-green-400">
          ${budget.remainingBudget.toFixed(2)}
        </span>
      </div>

      {/* Budget Reset Date */}
      <div className="flex items-center justify-between">
        <span className="text-text-secondary">
          {localize('com_nav_litellm_budget_resets') || 'Resets on'}
        </span>
        <span className="text-text-primary">
          {formatDate(budget.budgetResetAt)}
        </span>
      </div>

      {/* Budget Duration */}
      <div className="flex items-center justify-between">
        <span className="text-text-secondary">
          {localize('com_nav_litellm_budget_period') || 'Budget period'}
        </span>
        <span className="text-text-primary">
          {budget.budgetDuration}
        </span>
      </div>
    </div>
  );
}

export default React.memo(LiteLLMBudget);
