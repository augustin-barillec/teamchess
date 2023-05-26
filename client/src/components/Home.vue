<template>
  <div class="header"><h1>Team Chess</h1></div>
  <div class="nav">
    <a href="#">Link</a>
    <a href="#">Link</a>
    <a href="#">Link</a>
    <a href="#">Link</a>
  </div>
  <div class="row">
    <div class="side">
      <input type="text" name="user_name" v-model="user_name" required />
      <button @click="submitPlayerName">Submit player name</button><br />
      <button v-if="game_id === ''" type="submit" @click="createGame">Create a game</button><br />
      <button v-if="game_id !== '' && !show" type="submit" @click="joinGame(game_id)">Join current game</button><br />
      <button v-if="game_id !== ''" type="submit" @click="deleteGame">Leave current game</button>
      <br />
      <br />
      <button v-if="game_id !== ''" type="submit" @click="shareGame">Share current game</button>
    </div>
    <div class="main">
      <div v-if="show" class="board">
        <div v-for="n in 8" :key="`row_${n}`" :class="`row_${n}`">
          <div v-for="(letter, index) in letters" :key="`cell_${index + n}`" :class="['cell', { light: (index + n) % 2 === 0, dark: (index + n) % 2 !== 0 }]" :id="`cell_${letter}${n}`"></div>
        </div>
      </div>
    </div>
  </div>
  <div id="footer"><h1>Team Chess</h1></div>
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
      letters: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
      game_not_found: false,
      user_name: '',
      game_id: '',
      show_code_input: false,
      shared_id: '',
      show: false,
    };
  },
  methods: {
    joinGame(game_id) {
      console.log(game_id);
      if (game_id) {
        const path = 'http://localhost:5000/join_game';
        const player_id = this.getStorage('user_id');
        axios
          .post(path, { game_id, player_id })
          .then((res) => {
            const { success, error } = res.data;
            if (error) {
              toast.error(error);
            } else if (success) {
              console.log('success');
              toast.success(success);
              this.game_id = game_id;
              console.log('createStorage');
              this.createStorage('game_id', game_id);
              this.show = true;
              console.log('all ok');
            }
          })
          .catch((error) => {
            console.error(error);
            toast.error(error);
          });
      }
    },
    deleteGame() {
      const game_id = this.getStorage('game_id');
      const player_id = this.getStorage('user_id');
      if (game_id) {
        const path = 'http://localhost:5000/delete_game';
        axios
          .post(path, { game_id, player_id })
          .then((res) => {
            const { success, error } = res.data;
            if (error) {
              toast.error(error);
            } else if (success) {
              toast.success(success);
              this.deleteStorage('game_id');
              this.game_id = '';
            }
          })
          .catch((error) => {
            console.error(error);
            toast.error(error);
          });
      } else {
        toast.error('No game to leave');
      }
    },
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
          toast.success('Player name successfully updated !');
        })
        .catch((error) => {
          console.error(error);
          toast.error(error);
        });
    },
    initPlayer() {
      const player_id = this.getStorage('user_id');
      const game_id = this.$route.query.gameId || '';
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
            if (user.game_id) this.show = true;
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
            const { user, user_id } = res.data;
            this.user_name = user.user_name ? user.user_name : '';
            this.createStorage('user_id', user_id);
            if (game_id) this.joinGame(game_id);
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
    deleteStorage(key) {
      return localStorage.removeItem(key);
    },
  },
  created() {
    this.initPlayer();
  },
};
</script>
