import logging
import sys

def setup_logging():
    logger = logging.getLogger("problem_tracker")
    logger.setLevel(logging.INFO)

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(logging.INFO)
    
    formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
    handler.setFormatter(formatter)
    
    # Avoid duplicate logs if setup_logging is called multiple times
    if not logger.handlers:
        logger.addHandler(handler)
        
    # Set uvicorn loggers to WARNING to avoid spam
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.error").setLevel(logging.WARNING)

    return logger

logger = setup_logging()
