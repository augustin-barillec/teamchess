import os
import shutil


def delete_file_if_exists(file_path):
    if os.path.exists(file_path):
        os.remove(file_path)


def delete_files_if_exist(file_paths):
    for p in file_paths:
        delete_file_if_exists(p)


def delete_folder_if_exists(folder_path):
    if os.path.isdir(folder_path):
        shutil.rmtree(folder_path)
