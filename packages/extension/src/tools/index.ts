import { inputHandlers } from './input';
import { pageHandlers } from './page';
import { tabHandlers } from './tabs';
import type { ToolHandlers } from './types';

export const toolHandlers: ToolHandlers = { ...tabHandlers, ...pageHandlers, ...inputHandlers };
