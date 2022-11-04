import streamlit as st

text_input_white_team = st.text_input("white team", key="Enter your name")
button_input_reset_white_team = st.button('reset white team')

if text_input_white_team:
    with open('white_team.txt', 'a') as f:
        f.write(text_input_white_team + '#')

if button_input_reset_white_team:
    open('white_team.txt', 'w').close()


def read_white_team():
    with open('team_white.txt', 'r') as ff:
        res = ff.readlines()
    assert len(res) in (0, 1)
    if len(res) == 1:
        res = res[0].split('#')[:-1]
    return res


st.write(f"white team = {read_white_team()}")


text_input_white_moves = dict()
for name in read_white_team():
    text_input_white_moves[name] = st.text_input(
        f"{name} move", key=f"{name}")
