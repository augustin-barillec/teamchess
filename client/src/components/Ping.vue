<template>
  <div class="container">
    <button type="button" class="btn btn-primary" @click="getMessage">{{ msg }}</button>
    {{ data_return }}
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
    };
  },
  methods: {
    getMessage() {
      const path = "http://localhost:5000/ping";
      axios
        .get(path)
        .then((res) => {
          this.data_return = res.data;
        })
        .catch((error) => {
          console.error(error);
        });
    },
  },
  created() {},
};
</script>
