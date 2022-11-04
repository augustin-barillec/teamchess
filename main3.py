import chess
import streamlit as st
from cairosvg import svg2png
from chess import svg

with open('moves.txt') as f:
    moves_str = f.readlines()
    moves_total = [m[2:6] for m in moves_str]
    moves_total = [chess.Move.from_uci(m) for m in moves_total]

board = chess.Board()
for m in moves_total:
    board.push(m)

white_orientation = svg.board(board=board, orientation=chess.WHITE, size=400)
white_orientation = svg2png(bytestring=white_orientation)

black_orientation = svg.board(board=board, orientation=chess.BLACK, size=400)
black_orientation = svg2png(bytestring=black_orientation)

with open('team_white.txt') as f:
    team_white = f.readlines()
    team_white = [n[:-1] for n in team_white]

with open('team_black.txt') as f:
    team_black = f.readlines()
    team_black = [n[:-1] for n in team_black]


with open('current_white.txt') as f:
    current = f.readlines()
    current = [n[:-1] for n in current]
    names = [x.split(':')[0] for x in current]
    moves = [x.split(':')[1] for x in current]
    current_white = dict(zip(names, moves))

with open('current_black.txt') as f:
    current = f.readlines()
    current = [n[:-1] for n in current]
    names = [x.split(':')[0] for x in current]
    moves = [x.split(':')[1] for x in current]
    current_black = dict(zip(names, moves))


white_to_play = (len(moves_total) % 2 == 0)

st.title('Team Chess')

st.write(f'white: {team_white}')
st.write(f'black: {team_black}')

if white_to_play:
    st.write('White to play')
else:
    st.write('Black to play')

st.image(white_orientation, caption='white_orientation')
st.image(black_orientation, caption='black_orientation')

if white_to_play:
    for name in team_white:
        if name not in current_white:
            move = st.text_input(name, key=name, placeholder='Enter your move')
            if move:
                current_white[name] = move
    with open('current_white.txt', 'w') as f:
        for n in current_white:
            f.write(f'{n}:{current_white[n]}\n')
    if len(current_white) == len(team_white):
        open('current_white.txt', 'w').close()
        chosen_move = list(current_white.values())[0]
        chosen_move = f'{len(moves_total)//2 + 1}.{chosen_move}\n'
        with open('moves.txt', 'w') as f:
            for m in moves_str:
                f.write(m)
            f.write(chosen_move)
        st.experimental_rerun()
else:
    for name in team_black:
        if name not in current_black:
            move = st.text_input(name, key=name, placeholder='Enter your move')
            if move:
                current_black[name] = move
    with open('current_black.txt', 'w') as f:
        for n in current_black:
            f.write(f'{n}:{current_black[n]}\n')
    if len(current_black) == len(team_black):
        open('current_black.txt', 'w').close()
        chosen_move = list(current_black.values())[0]
        chosen_move = f'{len(moves_total)//2 + 1}.{chosen_move}\n'
        with open('moves.txt', 'w') as f:
            for m in moves_str:
                f.write(m)
        st.experimental_rerun()
