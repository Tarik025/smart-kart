
import os

from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI")
DATABASE_NAME = os.getenv("DATABASE_NAME")

client = MongoClient(MONGODB_URI)

db = client[DATABASE_NAME]

users_collection = db["users"]
products_collection = db["products"]
interactions_collection = db["interactions"]


def check_database_connection():
    client.admin.command("ping")
    return True
