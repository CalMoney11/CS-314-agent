import os
import discord
from anthropic import Anthropic
from dotenv import load_dotenv

# Load key variables from .env file
load_dotenv()

DISCORD_TOKEN = os.getenv("DISCORD_BOT_TOKEN")
ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY")

# Initialize Anthropic client
anthropic_client = Anthropic(api_key=ANTHROPIC_KEY)

# Initialize Discord client with necessary permissions (intents)
intents = discord.Intents.default()
intents.message_content = True
bot_client = discord.Client(intents=intents)

@bot_client.event
async def on_ready():
    print(f"Logged in successfully as: {bot_client.user}")

@bot_client.event
async def on_message(message):
    # Ignore messages sent by the bot itself to prevent infinite loops
    if message.author == bot_client.user:
        return

    # Respond if someone sends a message starting with !claude
    if message.content.startswith("!claude"):
        user_prompt = message.content.replace("!claude", "", 1).strip()

        if not user_prompt:
            await message.channel.send("Please provide a prompt! Example: `!claude Tell me a joke`")
            return

        # Gather target user mentions for context
        target_users = [u for u in message.mentions if u != bot_client.user]
        mention_instructions = ""
        
        if target_users:
            # Create a clean instruction mapping the name/tag for Claude
            user_list = ", ".join([f"{u.name} (mention format: {u.mention})" for u in target_users])
            mention_instructions = f" The user(s) mentioned are: {user_list}. If you need to tag them, weave their mention naturally into the flow of your message (do not just dump the tags at the very beginning)."

        # Show typing status while fetching the response
        async with message.channel.typing():
            try:
                response = anthropic_client.messages.create(
                    model="claude-sonnet-5-5",
                    max_tokens=1000,
                    system=(
                        "You are a helpful Discord bot responding directly in a chat room. "
                        "Never claim you cannot send messages or tell users to copy-paste your response. "
                        "Just write the exact text that the bot should say in the channel."
                        f"{mention_instructions}"
                    ),
                    messages=[{"role": "user", "content": user_prompt}]
                )
                
                # Safely extract text from blocks, avoiding thinking blocks
                claude_text = ""
                for block in response.content:
                    if hasattr(block, "text"):
                        claude_text += block.text

                # Send the response directly with Claude's natural text layout
                await message.channel.send(claude_text)

            except Exception as e:
                await message.channel.send(f"Error communicating with Claude: {e}")

# Run the bot
bot_client.run(DISCORD_TOKEN)