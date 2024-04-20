# Mapped challenge attachments

> delete this readme file and `.gitkeep` when you have dynamic attachments to upload.

This folder is used to store the attachments that will mapped for different players. The attachment files will be sorted by alphabetically and mapped to the players by `team_id`. Note that only one file will be available for the specific player here. If you have multiple attachments that need to be mapped, you should pack them into a single zipped file.

The mapping algorithm will ensure that different players will get different attachment in best effort. However, it's not guaranteed that the attachment will be unique for each player. If you uploads attachments that are fewer than players, the attachments will be mapped to the players in a loop, which means two players may get the same attachment.
