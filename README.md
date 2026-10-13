# current use:
This is a simple api set up to chat with claude in your terminal that doesn't mean it has access to your files or anything it is just a chat window that uses api tokens instead of a pro plan.

# setup:
you want to run it in a virtual inviornment so it works for the requirements (this will also be better because in the future it won't be in the terminal)

    python3 -m venv .venv

    source .venv/bin/activate

    pip install anthropic python-dotenv

    python terminal.py -m claude-opus-5-5 "Explain recursion in two sentences"

# How to run:
Run 
    source .venv/bin/activate 

again each time you open a new terminal then your...

    python terminal.py -m claude-opus-5-5 "Explain recursion simply"
    
    python terminal.py --model claude-haiku-5-5 "Quick question..."
    
    python terminal.py "Uses the default model"

# notes:
It will also give you your token in and out so you can start to understand usage
this is strictly for set up and understanding api and api key useage.