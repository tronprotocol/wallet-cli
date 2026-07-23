export interface WarningView {
  code: string;
  message: string;
}

export interface PermissionKeyView {
  address: string;
  weight: number;
  local: string | null;
}

export interface PermissionGroupView {
  id: number;
  name: string;
  threshold: number;
  keys: PermissionKeyView[];
}

export interface ActivePermissionView extends PermissionGroupView {
  operations: string[];
  operationLabels: string[];
  operationsHex: string;
  unknownOperationIds: number[];
}

export interface AccountPermissionsView {
  address: string;
  owner: PermissionGroupView;
  witness: PermissionGroupView | null;
  actives: ActivePermissionView[];
}
