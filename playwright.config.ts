import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests/browser',workers:1,timeout:180000,use:{baseURL:'http://127.0.0.1:4173',headless:true},webServer:{command:'npm run dev -- --port 4173',url:'http://127.0.0.1:4173',timeout:30000,reuseExistingServer:false}});
