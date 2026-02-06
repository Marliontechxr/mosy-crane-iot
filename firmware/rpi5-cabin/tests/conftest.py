"""
Conftest — add firmware/rpi5-cabin to sys.path for test imports.
"""
import sys
import os

# Add the rpi5-cabin directory to path so sensors/comms/data are importable
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
