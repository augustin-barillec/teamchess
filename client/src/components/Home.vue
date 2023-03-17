<template>
  <h1>Team Chess</h1>
  <div class="container">
    <input type="text" name="user_name" v-model="user_name" required />
    <button @click="submitPlayerName">Submit player name</button>

    <form action="/create_game" method="POST">
      <button type="submit">Create a game</button>
    </form>

    <form action="/join_game" method="POST">
      <button type="submit">Join a game</button>
      <input
        type="text"
        name="game_id"
        placeholder="game_id"
        :value="game_id_to_display"
        required
      />
      <div v-if="game_not_found">The game {{ game_id_to_display }} was not found</div>
    </form>
  </div>
</template>
<script>
import axios from "axios";

export default {
  name: "Home",
  data() {
    return {
      game_not_found: false,
      user_name: "",
      game_id_to_display: "",
    };
  },
  methods: {
    submitPlayerName() {
      const path = "http://localhost:5000/update_user_name";
      const player_id = this.getStorage("user_id");
      const { user_name } = this;
      axios
        .post(path, { user_name, player_id })
        .then((res) => {
          const { user, user_id } = res.data;
          this.user_name = user.user_name;
          this.createStorage("user_id", user_id);
        })
        .catch((error) => {
          console.error(error);
        });
    },
    initPlayer() {
      const player_id = this.getStorage("user_id");
      if (player_id) {
        const path = "http://localhost:5000/get_user";
        axios
          .post(path, { player_id })
          .then((res) => {
            const { user, user_id } = res.data;
            this.user_name = user.user_name;
            this.createStorage("user_id", user_id);
          })
          .catch((error) => {
            console.error(error);
          });
      } else {
        const path = "http://localhost:5000/create_user";
        axios
          .get(path)
          .then((res) => {
            this.createStorage("user_id", res.data?.user_id);
          })
          .catch((error) => {
            console.error(error);
          });
      }
    },
    createStorage(key, value) {
      localStorage.setItem(key, value);
    },
    getStorage(key) {
      return localStorage.getItem(key);
    },
  },
  created() {
    this.initPlayer();
  },
};
</script>
