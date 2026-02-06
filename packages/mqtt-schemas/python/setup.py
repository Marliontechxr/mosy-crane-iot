"""Setup for mosy-schemas Python package."""

from setuptools import setup, find_packages

setup(
    name="mosy-schemas",
    version="0.1.0",
    packages=find_packages(),
    python_requires=">=3.10",
    description="MOSY MQTT and Cosmos DB schema definitions for Python edge services",
)
