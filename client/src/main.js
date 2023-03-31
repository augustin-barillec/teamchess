import { createApp } from 'vue';
import Toast from 'vue-toastification';
import 'vue-toastification/dist/index.css';
import App from './App.vue';
import router from './router';

createApp(App).use(Toast, {
  timeout: 3000,
}).use(router).mount('#app');
