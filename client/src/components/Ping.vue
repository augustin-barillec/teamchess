<template>
  <div class="container">
    <button type="button" class="btn btn-primary" @click="getMessage">{{ msg }}</button>
    {{ data_return }}
  </div>
  <div class="container" style="background-color: beige;">
    <button type="button" class="btn btn-primary" @click="getUser">Get User</button>
    {{ data_user }}
  </div>
</template>
<script>
import axios from "axios";

export default {
  name: "Ping",
  data() {
    return {
      msg: "ping",
      data_return: "",
      data_user: "",
    };
  },
  methods: {
    getMessage() {
      const path = "http://localhost:5100/ping";
      axios
        .get(path)
        .then((res) => {
          this.data_return = res.data;
        })
        .catch((error) => {
          console.error(error);
        });
    },
    getUser() {
      const path = "http://localhost:5100/get_user";
      axios
        .get(path)
        .then((res) => {
          this.data_user = res.data;
        })
        .catch((error) => {
          console.error(error);
        });
    },
  },
  created() {},
};
</script>
