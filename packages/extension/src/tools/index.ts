import { debugHandlers } from './debug';
import { inputHandlers } from './input';
import { pageHandlers } from './page';
import { tabHandlers } from './tabs';
import { workflowHandlers } from './workflows';
import type { ToolHandlers } from './types';

export const toolHandlers: ToolHandlers = {
  ...tabHandlers,
  ...pageHandlers,
  ...inputHandlers,
  ...debugHandlers,
  ...workflowHandlers,
};
