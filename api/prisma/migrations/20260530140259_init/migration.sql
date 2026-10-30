-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "input" TEXT NOT NULL,
    "output" TEXT,
    "options" TEXT NOT NULL,
    "result" TEXT,
    "error" TEXT,
    "created_at" DATETIME NOT NULL,
    "updated_at" DATETIME NOT NULL,
    "last_accessed_at" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "tasks_owner_user_id_idx" ON "tasks"("owner_user_id");
