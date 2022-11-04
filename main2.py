import streamlit as st
import chess
import chess.svg

board = chess.Board()
move = chess.Move.from_uci("g1f3")
board.push(move)


from cairosvg import svg2png

x = svg2png(bytestring=chess.svg.board(board, size=300))

st.image(x)
