/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BASE?: string
  readonly VITE_ONTHELINE_ADDRESS_TESTNET?: string
  readonly VITE_ONTHELINE_DEPLOY_BLOCK_TESTNET?: string
  readonly VITE_ONTHELINE_ADDRESS_MAINNET?: string
  readonly VITE_ONTHELINE_DEPLOY_BLOCK_MAINNET?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
