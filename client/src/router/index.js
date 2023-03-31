// import Vue from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import homePage from '../components/Home.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'Home',
      component: homePage,
      meta: {
        title: 'Home Page - Example App',
        metaTags: [
          {
            name: 'description',
            content: 'The home page of our example app.',
          },
          {
            property: 'og:description',
            content: 'The home page of our example app.',
          },
        ],
      },
    },
  ],
});

router.beforeEach((to, from, next) => {
  // Get the page title from the route meta data that we have defined
  // See further down below for how we setup this data
  const { title } = to.meta;
  console.log(to.meta);
  console.log(title);
  // If the route has a title, set it as the page title of the document/page
  if (title) {
    document.title = title;
  }
  // Continue resolving the route
  next();
});

export default router;
