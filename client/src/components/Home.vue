<template>
  <h1>Team Chess</h1>
  <div class="container">
    <input type="text" name="user_name" v-model="user_name" required />
    <button @click="submitPlayerName">Submit player name</button><br />
    <button v-if="game_id === ''" type="submit" @click="createGame">Create a game</button><br />
    <button v-if="game_id !== ''" type="submit" @click="joinGame">Join current game</button><br />
    <button v-if="game_id !== ''" type="submit" @click="deleteGame">Leave current game</button>
    <br />
    <button v-if="game_id !== ''" type="submit" @click="shareGame">Share current game</button>
  </div>
</template>
<script>
import axios from 'axios';
import { useToast } from 'vue-toastification';

const toast = useToast();

export default {
  name: 'homePage',
  title: 'homePage',
  data() {
    return {
      game_not_found: false,
      user_name: '',
      game_id: '',
      show_code_input: false,
      shared_id: '',
    };
  },
  methods: {
    joinGame() {},
    deleteGame() {},
    shareGame() {
      const urlToShare = `${window.location.href}?gameId=${this.game_id}`;
      navigator.clipboard.writeText(urlToShare).then(
        () => {
          toast.success('Copied to clipboard !');
        },
        () => {
          toast.error('Error when copying to clipboard ...');
        },
      );
    },
    createGame() {
      const path = 'http://localhost:5000/create_game';
      const player_id = this.getStorage('user_id');
      axios
        .post(path, { player_id })
        .then((res) => {
          const { error, game_id } = res.data;
          if (error) {
            console.log('error', error);
            toast.error(error);
          } else {
            console.log('game_id', game_id);
            toast.success(`Game ${game_id} correctly created !`);
            this.game_id = game_id;
            this.createStorage('game_id', game_id);
          }
        })
        .catch((error) => {
          console.error(error);
          toast.error(error);
        });
    },
    submitPlayerName() {
      const path = 'http://localhost:5000/update_user_name';
      const player_id = this.getStorage('user_id');
      const { user_name } = this;
      axios
        .post(path, { user_name, player_id })
        .then((res) => {
          const { user, user_id } = res.data;
          this.user_name = user.user_name;
          this.createStorage('user_id', user_id);
        })
        .catch((error) => {
          console.error(error);
          toast.error(error);
        });
    },
    initPlayer() {
      const player_id = this.getStorage('user_id');
      const game_id = this.$route.query.gameId;
      if (player_id) {
        const path = 'http://localhost:5000/get_user';
        axios
          .post(path, { player_id })
          .then((res) => {
            const { user, user_id } = res.data;
            this.user_name = user.user_name ? user.user_name : '';
            this.game_id = user.game_id ? user.game_id : '';
            this.game_id = this.game_id !== '' ? this.game_id : game_id;
            if (user_id) this.createStorage('user_id', user_id);
            if (user.game_id) this.createStorage('game_id', user.game_id);
          })
          .catch((error) => {
            console.error(error);
            toast.error(error);
          });
      } else {
        const path = 'http://localhost:5000/create_user';
        axios
          .get(path)
          .then((res) => {
            this.createStorage('user_id', res.data?.user_id);
          })
          .catch((error) => {
            console.error(error);
            toast.error(error);
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
