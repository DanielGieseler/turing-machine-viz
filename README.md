This is a forked version of: http://turingmachine.io.
To my knowledge, that is the prettiest and most didatic turing machine visualization available online, but unfornatelly there is a problem that hinders its functionality. 

# Problems
The program syntax of the original version had two problems:
- At every step of the Turing Machine (TM) process, the head had to move (L or R).
- Related to the provious one, the move command and next state command are entangled, so that we can only specify a next state if there is a move command.

# Changes
- The program syntax is simplified to a quadruple format, which permits all possible commands:
  - {current state, read symbol, operation (write (1 or 0), or move (L or R)), next state}.
- The page instructions (in index.html) are also simplified in accordance to the previous change.
- Cleaned the examples done in the old syntax, and substituted for others from the book (Computability: Computable Functions, Logic, and the Foundations of Mathematics - R. Epstein & W. Carnielli, chapter 9).
  
# Setup
- Clone the repository
- Open a prompt command on the folder of the repository, and run:
  - `npm install` to install the first time
  - `npm start` to start everytime afterwards
- After started, the application should be running at: localhost:8080
