// Re-export the native module. On web, it will be resolved to GarageTransferModule.web.ts
// and on native platforms to GarageTransferModule.ts
export { default } from './src/GarageTransferModule';
export * from './src/GarageTransfer.types';
