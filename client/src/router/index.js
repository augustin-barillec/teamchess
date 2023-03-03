// import Vue from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import Ping from '../components/Ping.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'Ping',
      component: Ping,
    },
  ],
});

export default router;
